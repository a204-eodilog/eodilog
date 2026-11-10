package com.eodilog.visit.candidate;

import com.eodilog.global.id.UuidV7;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobFailure;
import com.eodilog.job.JobHandler;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobOutcome;
import com.eodilog.job.JobSubmission;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

/**
 * VISIT_DETECTION. AI 서버에 방문 감지 기능이 없어 백엔드 규칙으로 판정한다(외부 호출 없음).
 * <ul>
 * <li>대상: 요청자가 이 여행에 올린, 삭제되지 않은 READY 사진만. 후보의 방문자는 언제나 요청자 본인이다.</li>
 * <li>장소: 업로더가 사진에 직접 지정한 placeId가 있으면 그 장소, 없으면 비공개 EXIF GPS에서 {@link #MATCH_RADIUS_METERS}m 안의
 * 가장 가까운 여행 장소(현재 코스 + 여행 저장 장소, 같은 거리는 장소 ID 순). 둘 다 없으면 건너뛴다.</li>
 * <li>시각: 사용자가 지정한 capturedAt, 없으면 EXIF 촬영 시각을 {@link #EXIF_ZONE}으로 해석. 없거나 서버 시각+5분보다 미래면 건너뛴다.</li>
 * <li>장소마다 후보 하나(근거 사진 묶음, visitedAt은 가장 이른 시각). 요청자가 이미 체크한 장소는 제안하지 않는다.</li>
 * </ul>
 * 후보 행은 완료 트랜잭션에서 여행 행을 잠근 뒤 요청자 권한과 근거 사진을 다시 확인하고 만든다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class VisitDetectionHandler implements JobHandler {

	public static final int MAX_PHOTOS = 50;
	public static final int MATCH_RADIUS_METERS = 200;
	static final ZoneId EXIF_ZONE = ZoneId.of("Asia/Seoul");
	private static final Duration FUTURE_TOLERANCE = Duration.ofMinutes(5);
	private static final DateTimeFormatter EXIF_TIME = DateTimeFormatter.ofPattern("yyyy:MM:dd HH:mm:ss");
	private static final String LIVE_PHOTOS = " from photos p join assets a on a.id=p.asset_id"
			+ " where p.id in (:ids) and p.trip_id=:trip and p.uploader_member_id=:member and p.deleted_at is null and a.status='READY'";
	private static final String PLACE_POINT = "ST_SetSRID(ST_MakePoint(p.longitude::double precision, p.latitude::double precision), 4326)::geography";

	private final NamedParameterJdbcTemplate jdbc;
	private final Clock clock;
	private final VisitCandidateAccess access;

	@Override
	public JobKind kind() {
		return JobKind.VISIT_DETECTION;
	}

	@Override
	public void validate(JobSubmission s) {
		var ids = s.input().path("photoIds");
		if (s.tripId() == null || s.baseVersion() != null || s.input().size() != 2 || !ids.isArray() || ids.isEmpty()
				|| ids.size() > MAX_PHOTOS || !s.input().path("memberId").isString())
			throw new IllegalArgumentException("Invalid visit detection input");
		UUID.fromString(s.input().path("memberId").asString());
		Set<UUID> seen = new HashSet<>();
		for (var id : ids) {
			if (!id.isString() || !seen.add(UUID.fromString(id.asString())))
				throw new IllegalArgumentException("Invalid visit detection photo");
		}
	}

	@Override
	public JobOutcome execute(JobContext c) {
		try {
			return JobOutcome.succeeded(detect(c.submission()));
		} catch (DataAccessException ex) {
			log.warn("visit_detection_failed jobId={} category=database exceptionClass={}", c.jobId(), ex.getClass().getSimpleName());
			return JobOutcome.failed(JobFailure.TEMPORARY_FAILURE);
		}
	}

	private record Evidence(UUID photoId, UUID placeId, Instant at) {
	}

	private ObjectNode detect(JobSubmission s) {
		UUID trip = s.tripId();
		UUID member = UUID.fromString(s.input().path("memberId").asString());
		List<UUID> ids = new ArrayList<>();
		s.input().path("photoIds").forEach(id -> ids.add(UUID.fromString(id.asString())));
		List<Evidence> evidence = evidence(trip, member, ids);
		Set<UUID> visited = evidence.isEmpty() ? Set.of() : new HashSet<>(jdbc.queryForList(
				"select place_id from visits where trip_id=:trip and member_id=:member and deleted_at is null and place_id in (:places)",
				new MapSqlParameterSource().addValue("trip", trip).addValue("member", member)
						.addValue("places", evidence.stream().map(Evidence::placeId).distinct().toList()), UUID.class));
		Map<UUID, List<Evidence>> byPlace = new TreeMap<>();
		evidence.stream().filter(e -> !visited.contains(e.placeId()))
				.forEach(e -> byPlace.computeIfAbsent(e.placeId(), k -> new ArrayList<>()).add(e));
		ObjectNode result = JsonNodeFactory.instance.objectNode();
		var candidates = result.putArray("candidates");
		byPlace.forEach((place, found) -> {
			var candidate = candidates.addObject().put("id", UuidV7.generate().toString()).put("placeId", place.toString())
					.put("visitedAt", earliest(found).toString());
			var photos = candidate.putArray("evidencePhotoIds");
			found.stream().map(Evidence::photoId).sorted().forEach(id -> photos.add(id.toString()));
		});
		return result;
	}

	/**
	 * 요청자의 살아 있는 사진마다 (장소, 시각)을 한 번의 쿼리로 판정한다. GPS 장소는 여행 장소(코스·저장) 중 반경 안 가장 가까운 곳을
	 * LATERAL로 고른다. 사진에 지정한 장소가 우선이고, 장소나 유효한 시각이 없는 사진은 빠진다.
	 */
	private List<Evidence> evidence(UUID trip, UUID member, java.util.Collection<UUID> ids) {
		Instant latest = clock.instant().plus(FUTURE_TOLERANCE);
		var params = new MapSqlParameterSource().addValue("ids", ids).addValue("trip", trip).addValue("member", member)
				.addValue("radius", MATCH_RADIUS_METERS);
		// 중첩 CASE로 숫자인지 먼저 확인한 뒤에만 형변환한다(AND는 평가 순서가 보장되지 않는다)
		var rows = jdbc.query("""
				with trip_places as (select place_id from trip_place_saves where trip_id = :trip
				                     union select ii.place_id from itinerary_items ii join itineraries i on i.id = ii.itinerary_id
				                     where i.trip_id = :trip),
				     src as (select p.id, p.place_id, p.captured_at, a.metadata_json->>'capturedAtLocal' as local_time,
				                    case when jsonb_typeof(a.metadata_json->'latitude') = 'number'
				                              and jsonb_typeof(a.metadata_json->'longitude') = 'number' then
				                         case when abs((a.metadata_json->>'latitude')::numeric) <= 90
				                                   and abs((a.metadata_json->>'longitude')::numeric) <= 180 then
				                              ST_SetSRID(ST_MakePoint((a.metadata_json->>'longitude')::double precision,
				                                                      (a.metadata_json->>'latitude')::double precision), 4326)::geography
				                         end
				                    end as g
				             %1$s)
				select src.id, src.place_id, src.captured_at, src.local_time, near.id as near_place
				from src left join lateral (
				    select p.id from places p join trip_places t on t.place_id = p.id
				    where src.place_id is null and src.g is not null and ST_DWithin(%2$s, src.g, :radius)
				    order by ST_Distance(%2$s, src.g), p.id limit 1) near on true
				order by src.id""".formatted(LIVE_PHOTOS, PLACE_POINT), params, (rs, row) -> {
					Timestamp captured = rs.getTimestamp("captured_at");
					Instant at = captured != null ? captured.toInstant() : exifTime(rs.getString("local_time"));
					UUID place = rs.getObject("place_id", UUID.class);
					if (place == null) {
						place = rs.getObject("near_place", UUID.class);
					}
					return at == null || at.isAfter(latest) || place == null ? null
							: new Evidence(rs.getObject("id", UUID.class), place, at);
				});
		return rows.stream().filter(java.util.Objects::nonNull).toList();
	}

	private static Instant earliest(List<Evidence> found) {
		return found.stream().map(Evidence::at).min(Instant::compareTo).orElseThrow();
	}

	private static Instant exifTime(String value) {
		if (value == null) {
			return null;
		}
		try {
			return LocalDateTime.parse(value.trim(), EXIF_TIME).atZone(EXIF_ZONE).toInstant();
		} catch (DateTimeParseException ex) {
			return null;
		}
	}

	/**
	 * 여행 행을 잠근 뒤 권한·근거를 다시 확인해 후보를 만든다. 그 사이 나갔거나 설정을 끈 요청자에게는 아무것도 만들지 않는다(작업은 성공).
	 * 근거는 지금도 살아 있고 같은 장소로 판정되는 사진만 남기고, visitedAt은 남은 근거로 다시 계산한다.
	 * 같은 결과를 다시 반영해도 후보 ID가 같아 중복이 생기지 않는다.
	 */
	@Override
	public void complete(JobContext c, JsonNode result) {
		var s = c.submission();
		UUID trip = s.tripId();
		UUID member = UUID.fromString(s.input().path("memberId").asString());
		jdbc.query("select id from trips where id=:trip for update", new MapSqlParameterSource("trip", trip), rs -> {
		});
		if (!access.allowed(trip, s.requestedByUserId())) {
			return;
		}
		Set<UUID> requested = new HashSet<>();
		s.input().path("photoIds").forEach(id -> requested.add(UUID.fromString(id.asString())));
		Instant now = clock.instant();
		for (var candidate : result.path("candidates")) {
			UUID id = UUID.fromString(candidate.path("id").asString());
			UUID place = UUID.fromString(candidate.path("placeId").asString());
			Set<UUID> photos = new TreeSet<>();
			candidate.path("evidencePhotoIds").forEach(p -> photos.add(UUID.fromString(p.asString())));
			if (photos.isEmpty() || !requested.containsAll(photos)) {
				throw new IllegalArgumentException("Invalid visit detection result");
			}
			var live = evidence(trip, member, photos).stream().filter(e -> e.placeId().equals(place)).toList();
			var params = new MapSqlParameterSource().addValue("trip", trip).addValue("member", member).addValue("place", place)
					.addValue("id", id).addValue("job", c.jobId()).addValue("now", Timestamp.from(now));
			boolean visited = Boolean.TRUE.equals(jdbc.queryForObject(
					"select exists(select 1 from visits where trip_id=:trip and member_id=:member and place_id=:place and deleted_at is null)",
					params, Boolean.class));
			if (live.isEmpty() || visited) {
				continue;
			}
			params.addValue("visitedAt", Timestamp.from(earliest(live)));
			jdbc.update("""
					insert into visit_candidates(id,job_id,trip_id,member_id,place_id,visited_at,created_at)
					values(:id,:job,:trip,:member,:place,:visitedAt,:now) on conflict (id) do nothing""", params);
			for (UUID photo : new TreeSet<>(live.stream().map(Evidence::photoId).toList())) {
				jdbc.update("insert into visit_candidate_photos(candidate_id,photo_id) values(:id,:photo) on conflict do nothing",
						new MapSqlParameterSource().addValue("id", id).addValue("photo", photo));
			}
		}
	}

}
