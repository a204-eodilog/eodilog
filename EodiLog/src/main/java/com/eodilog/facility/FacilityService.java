package com.eodilog.facility;

import com.eodilog.facility.ev.EvChargerProperties;
import com.eodilog.facility.ev.EvChargerStore;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.common.response.PageResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 주변 편의시설(명세 Q-8, EODI-304). 기준 장소에서 반경 안의 시설을 가까운 순(직선거리, 같으면 ID 순)으로 준다.
 *
 * <ul>
 * <li>전기차 충전소: ev_stations. 상태는 충전소별 충전기 상태를 세어 문장으로 만든다. 갱신이 {@code staleAfter}보다
 * 오래 멈췄거나 빈틈을 메우지 못했으면(status_valid=false) 상태를 숨긴다. 첫 적재 전이면 503</li>
 * <li>화장실: public_toilets. 자료를 넣지 않았으면 503</li>
 * <li>약국·편의점·주유소: places의 업종 소분류(공공데이터 상권업종) 또는 이름. 업종이 없는 장소도 이름으로 찾는다</li>
 * </ul>
 */
@Service
public class FacilityService {

	static final int MIN_RADIUS = 500, MAX_RADIUS = 5000;
	// 직선거리를 걷는 길로 늘리는 비율과 걷는 속도(시속 4.5km)
	private static final double DETOUR = 1.3, WALK_METERS_PER_SECOND = 1.25;

	private static final String POINT = "ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography";
	// 각 표의 좌표 식 인덱스와 같은 식이어야 인덱스를 탄다(places는 numeric 열이라 형을 바꾼다)
	private static final String PLACE_GEO = "ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography";
	private static final String TABLE_GEO = "ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography";

	// 업종은 공공데이터 상권업종 '대>중>소' 이름이다. 소분류가 일치하거나, 업종이 달라도 이름이 시설이면 찾는다
	private static final Map<FacilityType, String> PLACE_FILTERS = Map.of(
			FacilityType.PHARMACY, "(category ~ '(^|>)약국$' OR name ~ '약국$')",
			FacilityType.CONVENIENCE_STORE, "(category ~ '(^|>)편의점$' OR name ~* '^(cu|씨유|gs25|지에스25|세븐일레븐|7-eleven|이마트24|emart24|미니스톱)([[:space:]]|$)')",
			FacilityType.GAS_STATION, "(category ~ '(^|>)주유소$' OR name ~ '주유소')");

	// 공급자 충전기 상태: 2 충전 대기, 3 충전 중, 4 운영 중지, 5 점검 중(1 통신 이상, 9 미확인은 모름)
	// 완속: 종류 02(AC 완속) 또는 출력 30kW 미만. 그 밖은 급속으로 센다
	private static final String SLOW = "(charger_type = '02' OR (output_kw IS NOT NULL AND output_kw < 30))";

	private final NamedParameterJdbcTemplate jdbc;
	private final EvChargerStore evStore;
	private final EvChargerProperties evProperties;
	private final Clock clock;

	public FacilityService(NamedParameterJdbcTemplate jdbc, EvChargerStore evStore, EvChargerProperties evProperties, Clock clock) {
		this.jdbc = jdbc;
		this.evStore = evStore;
		this.evProperties = evProperties;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public PageResponse<FacilityView> nearby(UUID placeId, String typeValue, int radiusMeters, String cursor, int limit) {
		FacilityType type = parseType(typeValue);
		if (radiusMeters < MIN_RADIUS || radiusMeters > MAX_RADIUS) throw invalid("radiusMeters", "반경은 500~5000m입니다.");
		if (limit < 1 || limit > 100) throw invalid("limit", "limit은 1~100입니다.");
		var base = jdbc.query("SELECT latitude::double precision AS lat, longitude::double precision AS lng FROM places WHERE id = :id",
				Map.of("id", placeId), (rs, row) -> new double[] { rs.getDouble("lat"), rs.getDouble("lng") });
		if (base.isEmpty()) throw new BusinessException(CommonErrorCode.NOT_FOUND);
		String binding = binding(placeId, type, radiusMeters);
		Cursor after = cursor == null ? null : Cursor.decode(cursor, binding);

		var params = new MapSqlParameterSource().addValue("latitude", base.getFirst()[0]).addValue("longitude", base.getFirst()[1])
				.addValue("radius", radiusMeters).addValue("baseId", placeId).addValue("n", limit + 1);
		if (after != null) params.addValue("afterDistance", after.distance()).addValue("afterId", after.id());
		Instant now = clock.instant();
		EvChargerStore.State ev = null;
		String sql = switch (type) {
			case EV_CHARGER -> {
				ev = evStore.state();
				if (ev.fullCompletedAt() == null) throw new BusinessException(FacilityErrorCode.FACILITY_UNAVAILABLE);
				yield nearbySql("SELECT id AS provider_id, name, latitude, longitude, " + TABLE_GEO + " <-> " + POINT
						+ " AS distance FROM ev_stations WHERE ST_DWithin(" + TABLE_GEO + ", " + POINT + ", :radius, false)", after);
			}
			case TOILET -> {
				if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM public_toilets)", Map.of(), Boolean.class)))
					throw new BusinessException(FacilityErrorCode.FACILITY_UNAVAILABLE);
				yield nearbySql("SELECT id::text AS provider_id, name, latitude, longitude, " + TABLE_GEO + " <-> " + POINT
						+ " AS distance FROM public_toilets WHERE ST_DWithin(" + TABLE_GEO + ", " + POINT + ", :radius, false)", after);
			}
			default -> nearbySql("SELECT id::text AS provider_id, name, latitude::double precision AS latitude,"
					+ " longitude::double precision AS longitude, " + PLACE_GEO + " <-> " + POINT + " AS distance FROM places WHERE ST_DWithin("
					+ PLACE_GEO + ", " + POINT + ", :radius, false) AND id <> :baseId AND " + PLACE_FILTERS.get(type), after);
		};
		record Row(String id, String name, double latitude, double longitude, double distance) {
		}
		List<Row> rows = jdbc.query(sql, params, (rs, i) -> new Row(rs.getString("provider_id"), rs.getString("name"),
				rs.getDouble("latitude"), rs.getDouble("longitude"), rs.getDouble("distance")));
		boolean hasNext = rows.size() > limit;
		List<Row> page = rows.subList(0, Math.min(rows.size(), limit));

		Map<String, String> availability = Map.of();
		Instant queriedAt = now;
		if (ev != null) {
			boolean fresh = ev.statusValid() && ev.statusSyncedAt() != null
					&& Duration.between(ev.statusSyncedAt(), now).compareTo(evProperties.staleAfter()) <= 0;
			if (fresh && !page.isEmpty()) availability = evAvailability(page.stream().map(Row::id).toList());
			if (ev.statusSyncedAt() != null) queriedAt = ev.statusSyncedAt();
		}
		List<FacilityView> items = new ArrayList<>();
		for (Row row : page) {
			items.add(new FacilityView(row.id(), row.name(), type, row.latitude(), row.longitude(),
					(int) Math.round(row.distance() * DETOUR / WALK_METERS_PER_SECOND), availability.get(row.id()), queriedAt));
		}
		String next = hasNext ? new Cursor(page.getLast().distance(), page.getLast().id()).encode(binding) : null;
		return PageResponse.of(items, next, hasNext);
	}

	// 반경 안을 좌표 인덱스로 읽고 거리를 한 번만 계산하도록 울타리(OFFSET 0)로 막은 뒤 가까운 순으로 줄 세운다
	private static String nearbySql(String inner, Cursor after) {
		return "SELECT * FROM (" + inner + " OFFSET 0) f WHERE f.distance <= :radius"
				+ (after == null ? "" : " AND (f.distance, f.provider_id) > (:afterDistance, CAST(:afterId AS text))")
				+ " ORDER BY f.distance, f.provider_id LIMIT :n";
	}

	/** 충전소별 상태 문장. 상태를 아는 충전기가 없으면 문장을 만들지 않는다(null) */
	private Map<String, String> evAvailability(List<String> stationIds) {
		Map<String, String> result = new HashMap<>();
		jdbc.query("SELECT station_id, count(*) FILTER (WHERE status = '2' AND NOT " + SLOW + ") AS fast_free,"
				+ " count(*) FILTER (WHERE status = '2' AND " + SLOW + ") AS slow_free,"
				+ " count(*) FILTER (WHERE status = '3') AS busy, count(*) FILTER (WHERE status IN ('2', '3', '4', '5')) AS known"
				+ " FROM ev_chargers WHERE station_id IN (:ids) GROUP BY station_id", Map.of("ids", stationIds), rs -> {
					String text = availabilityText(rs.getInt("fast_free"), rs.getInt("slow_free"), rs.getInt("busy"), rs.getInt("known"));
					if (text != null) result.put(rs.getString("station_id"), text);
				});
		return result;
	}

	static String availabilityText(int fastFree, int slowFree, int busy, int known) {
		if (known == 0) return null;
		if (fastFree + slowFree > 0) {
			List<String> parts = new ArrayList<>();
			if (fastFree > 0) parts.add("급속 " + fastFree + "대");
			if (slowFree > 0) parts.add("완속 " + slowFree + "대");
			return String.join("·", parts) + " 사용 가능";
		}
		return busy > 0 ? "모두 충전 중" : "운영 중지·점검 중";
	}

	private static FacilityType parseType(String value) {
		try {
			return FacilityType.valueOf(value == null ? "" : value.strip());
		} catch (IllegalArgumentException e) {
			throw invalid("type", "type은 EV_CHARGER, GAS_STATION, TOILET, PHARMACY, CONVENIENCE_STORE 중 하나입니다.");
		}
	}

	private static BusinessException invalid(String field, String reason) {
		return new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
				List.of(new ErrorField(field, reason)));
	}

	static String binding(UUID placeId, FacilityType type, int radius) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256")
					.digest((placeId + "|" + type + "|" + radius).getBytes(StandardCharsets.UTF_8));
			return Base64.getUrlEncoder().withoutPadding().encodeToString(Arrays.copyOf(digest, 9));
		} catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	/** 마지막 줄의 (거리, ID)와 조건(장소·종류·반경)을 담은 Base64URL 커서. 조건이 다르면 400 */
	record Cursor(double distance, String id) {

		String encode(String binding) {
			String raw = binding + "|" + distance + "|" + id;
			return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
		}

		static Cursor decode(String value, String binding) {
			try {
				if (value.length() > 512 || !value.matches("[A-Za-z0-9_-]+")) throw new IllegalArgumentException();
				String[] parts = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8).split("\\|", 3);
				if (parts.length != 3 || !parts[0].equals(binding) || parts[2].isEmpty() || parts[2].length() > 64)
					throw new IllegalArgumentException();
				double distance = Double.parseDouble(parts[1]);
				if (!Double.isFinite(distance) || distance < 0) throw new IllegalArgumentException();
				Cursor cursor = new Cursor(distance, parts[2]);
				if (!cursor.encode(binding).equals(value)) throw new IllegalArgumentException();
				return cursor;
			} catch (RuntimeException e) {
				throw invalid("cursor", "올바르지 않은 커서입니다. 처음부터 다시 조회해 주세요.");
			}
		}
	}

}
