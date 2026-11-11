package com.eodilog.recommendation;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * TRIP_RECOMMENDATION 등록 때 고정하는 AI 입력(AI spec §4 요청). 등록 뒤 취향·즐겨찾기가 바뀌어도 이 값으로 추천한다.
 *
 * <p>취향은 멤버마다 "이 여행에서 쓸 수 있는" 것만 보낸다. 규칙은 A의 {@code PreferenceService.consent}와 같다.
 * 여행 범위가 INHERIT면 전역 범위, 추론을 허용하지 않았으면 추론 제외, NONE이면 쓰지 않는다.
 * A 코드에 읽기 전용 조회가 없어 여기서 같은 규칙으로 읽는다(2026-11-11 결정). 규칙이 바뀌면 함께 고친다.
 */
@Component
@RequiredArgsConstructor
class TripRecommendationSnapshot {

	static final int MAX_SAVED_PLACES = 200;
	static final int MAX_CANDIDATES = 100;
	static final int CANDIDATES_PER_TASTE = 20;
	static final int MAX_TASTES = 10;

	private final NamedParameterJdbcTemplate jdbc;
	private final JsonMapper jsonMapper;

	/** 작업 입력 필드. 후보 장소는 비공개 자료가 아니라 등록 때 고르지 않고, 작업이 실행될 때 {@link #aiRequest}가 고른다 */
	static final String AREA_FIELD = "candidateAreaRegionIds";

	/**
	 * 등록 때 고정하는 입력: 여행, 멤버 취향, 그룹 즐겨찾기, 즐겨찾기 장소의 지역, 후보를 찾을 지역(상위 ID).
	 * 전국 장소에서 후보를 고르는 쿼리는 여행지가 넓으면 수 초가 걸려, 여행 행을 잠근 등록 요청 안에서 돌리지 않는다.
	 * regionId가 있으면 후보를 그 지역(하위 포함)에서만 고른다
	 */
	ObjectNode build(UUID tripId, UUID regionId) {
		ObjectNode input = jsonMapper.createObjectNode();
		input.set("trip", trip(tripId));
		List<Member> members = members(tripId);
		ArrayNode memberNodes = input.putArray("members");
		for (Member m : members) {
			ObjectNode n = memberNodes.addObject().put("memberId", m.memberId().toString()).put("nickname", m.nickname());
			ArrayNode explicit = n.putArray("explicit");
			m.explicit().forEach(explicit::add);
			ArrayNode inferred = n.putArray("inferred");
			m.inferred().forEach(inferred::add);
		}
		Map<UUID, ObjectNode> saved = savedPlaces(tripId);
		input.set("savedPlaces", jsonMapper.createArrayNode().addAll(saved.values()));
		Set<UUID> regionIds = new LinkedHashSet<>();
		saved.values().forEach(s -> regionId(s.get("place")).ifPresent(regionIds::add));
		input.set("regions", regions(regionIds));
		input.putArray("excludePlaceIds");
		ArrayNode area = input.putArray(AREA_FIELD);
		roots(tripId, regionId, saved.values()).forEach(id -> area.add(id.toString()));
		return input;
	}

	/**
	 * 작업 실행 때(트랜잭션 밖) 만드는 AI 요청 본문(AI spec §4). 등록 때 고정한 입력에 후보 장소와 그 지역을 더하고
	 * 내부 필드(후보 지역)는 뺀다. 후보는 등록 때 고정한 취향·즐겨찾기 기준으로 고른다
	 */
	ObjectNode aiRequest(tools.jackson.databind.JsonNode input) {
		ObjectNode body = (ObjectNode) input.deepCopy();
		body.remove(AREA_FIELD);
		List<UUID> roots = new ArrayList<>();
		input.path(AREA_FIELD).forEach(n -> roots.add(UUID.fromString(n.asString())));
		Set<UUID> savedIds = new HashSet<>();
		input.path("savedPlaces").forEach(s -> savedIds.add(UUID.fromString(s.path("place").path("id").asString())));
		List<Member> members = new ArrayList<>();
		input.path("members").forEach(m -> members.add(new Member(UUID.fromString(m.path("memberId").asString()),
				m.path("nickname").asString(""), strings(m.path("explicit")), strings(m.path("inferred")))));
		ArrayNode candidates = candidates(area(roots), tastes(members), savedIds);
		body.set("candidatePlaces", candidates);
		Set<String> known = new HashSet<>();
		body.path("regions").forEach(r -> known.add(r.path("id").asString()));
		Set<UUID> more = new LinkedHashSet<>();
		candidates.forEach(c -> regionId(c).filter(id -> !known.contains(id.toString())).ifPresent(more::add));
		ArrayNode regions = (ArrayNode) body.get("regions");
		regions(more).forEach(regions::add);
		return body;
	}

	private static List<String> strings(tools.jackson.databind.JsonNode array) {
		List<String> values = new ArrayList<>();
		array.forEach(n -> values.add(n.asString()));
		return values;
	}

	private ObjectNode trip(UUID tripId) {
		var p = new MapSqlParameterSource("tripId", tripId);
		ObjectNode trip = jdbc.queryForObject("select id, start_date, end_date from trips where id = :tripId", p,
				(rs, n) -> {
					ObjectNode t = jsonMapper.createObjectNode().put("id", rs.getObject("id", UUID.class).toString());
					putDate(t, "startDate", rs.getString("start_date"));
					putDate(t, "endDate", rs.getString("end_date"));
					return t;
				});
		ArrayNode destinations = trip.putArray("destinationRegionIds");
		jdbc.query("select region_id from trip_destinations where trip_id = :tripId order by display_order", p,
				rs -> { destinations.add(rs.getObject("region_id", UUID.class).toString()); });
		return trip;
	}

	private static void putDate(ObjectNode node, String field, String value) {
		if (value == null) node.putNull(field); else node.put(field, value);
	}

	record Member(UUID memberId, String nickname, List<String> explicit, List<String> inferred) {
	}

	// ACTIVE 멤버와 이 여행에서 쓸 수 있는 취향(합류 순). 활성·가입 완료가 아닌 회원은 취향을 쓰지 않는다
	private List<Member> members(UUID tripId) {
		List<Member> members = new ArrayList<>();
		jdbc.query("""
				select m.id as member_id, m.user_id, u.nickname, m.preference_scope, u.preference_sharing_scope,
				       u.inference_consent, (u.status = 'ACTIVE' and u.profile_completed) as usable
				from trip_members m join users u on u.id = m.user_id
				where m.trip_id = :tripId and m.status = 'ACTIVE'
				order by m.join_order, m.id""", new MapSqlParameterSource("tripId", tripId), rs -> {
			String scope = effectiveScope(rs.getString("preference_scope"), rs.getString("preference_sharing_scope"),
					rs.getBoolean("inference_consent"));
			UUID userId = rs.getObject("user_id", UUID.class);
			boolean usable = rs.getBoolean("usable");
			boolean explicit = usable && !"NONE".equals(scope);
			boolean inferred = usable && "EXPLICIT_AND_INFERRED".equals(scope);
			members.add(new Member(rs.getObject("member_id", UUID.class),
					rs.getString("nickname") == null ? "" : rs.getString("nickname"),
					explicit ? tasteKeys(userId, "EXPLICIT") : List.of(), inferred ? tasteKeys(userId, "INFERRED") : List.of()));
		});
		return members;
	}

	/** A의 PreferenceService.consent와 같은 규칙. 여행 범위 INHERIT면 전역 범위, 추론 불허면 EXPLICIT_AND_INFERRED를 EXPLICIT_ONLY로 */
	static String effectiveScope(String tripScope, String globalScope, boolean inferenceConsent) {
		String effective = tripScope == null || "INHERIT".equals(tripScope) ? globalScope : tripScope;
		if (effective == null) return "NONE";
		if (!inferenceConsent && "EXPLICIT_AND_INFERRED".equals(effective)) return "EXPLICIT_ONLY";
		return effective;
	}

	private List<String> tasteKeys(UUID userId, String source) {
		return jdbc.queryForList("select key from user_preferences where user_id = :userId and source = :source order by position, key",
				new MapSqlParameterSource("userId", userId).addValue("source", source), String.class);
	}

	// 멤버들이 가진 취향을 많이 가진 순으로(같으면 처음 나온 순) 최대 MAX_TASTES개
	static List<String> tastes(List<Member> members) {
		Map<String, Integer> counts = new LinkedHashMap<>();
		for (Member m : members) {
			Set<String> mine = new LinkedHashSet<>(m.explicit());
			mine.addAll(m.inferred());
			mine.forEach(t -> counts.merge(t, 1, Integer::sum));
		}
		return counts.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
				.limit(MAX_TASTES).map(Map.Entry::getKey).toList();
	}

	// 그룹 즐겨찾기(나간 멤버가 담은 것 포함, 화면 S20과 같은 범위). 담은 사람이 많은 순으로 최대 MAX_SAVED_PLACES곳.
	// 메모는 추천에 필요 없어 보내지 않는다
	private Map<UUID, ObjectNode> savedPlaces(UUID tripId) {
		Map<UUID, ObjectNode> saved = new LinkedHashMap<>();
		jdbc.query("""
				select p.id, p.name, p.address, p.latitude, p.longitude, p.region_id, p.provider, p.provider_place_id,
				       p.source, p.category, array_agg(s.saved_by_member_id::text order by s.created_at, s.saved_by_member_id) as savers
				from trip_place_saves s join places p on p.id = s.place_id
				where s.trip_id = :tripId
				group by p.id
				order by count(*) desc, min(s.created_at), p.id
				limit :limit""", new MapSqlParameterSource("tripId", tripId).addValue("limit", MAX_SAVED_PLACES), rs -> {
			ObjectNode entry = jsonMapper.createObjectNode();
			entry.set("place", place(rs));
			ArrayNode savedBy = entry.putArray("savedBy");
			String[] savers = (String[]) rs.getArray("savers").getArray();
			for (String saver : savers) {
				savedBy.addObject().put("memberId", saver).putNull("memo");
			}
			entry.put("savedCount", savers.length);
			saved.put(rs.getObject("id", UUID.class), entry);
		});
		return saved;
	}

	// 후보를 찾을 지역(상위): 요청 지역 → 여행지 → 즐겨찾기 장소의 지역
	private List<UUID> roots(UUID tripId, UUID regionId, Collection<ObjectNode> saved) {
		if (regionId != null) return List.of(regionId);
		List<UUID> roots = jdbc.queryForList("select region_id from trip_destinations where trip_id = :tripId order by display_order",
				new MapSqlParameterSource("tripId", tripId), UUID.class);
		if (!roots.isEmpty()) return roots;
		return saved.stream().map(s -> regionId(s.get("place"))).flatMap(Optional::stream).distinct().toList();
	}

	// 상위 지역과 그 하위 지역 전체
	private List<UUID> area(List<UUID> roots) {
		if (roots.isEmpty()) return List.of();
		return jdbc.queryForList("""
				with recursive area(id) as (
				  select id from regions where id in (:roots)
				  union select r.id from regions r join area a on r.parent_id = a.id)
				select id from area""", new MapSqlParameterSource("roots", roots), UUID.class);
	}

	// 취향 낱말마다 이름·분류가 맞는 장소를 최대 CANDIDATES_PER_TASTE곳. 즐겨찾기 장소와 이미 고른 장소는 뺀다.
	// AI가 취향을 읽는 규칙(preference_inference: 카페, 음식점→맛집, 해수욕장·해변→바다, 산, 공원→산책)에 맞춰 낱말을 넓힌다
	private ArrayNode candidates(List<UUID> area, List<String> tastes, Set<UUID> savedIds) {
		ArrayNode result = jsonMapper.createArrayNode();
		if (area.isEmpty() || tastes.isEmpty()) return result;
		Set<UUID> picked = new HashSet<>(savedIds);
		for (String taste : tastes) {
			if (result.size() >= MAX_CANDIDATES) break;
			List<String> patterns = new ArrayList<>();
			for (String word : words(taste)) patterns.add("%" + escape(word.toLowerCase(Locale.ROOT)) + "%");
			StringBuilder match = new StringBuilder();
			for (int i = 0; i < patterns.size(); i++) {
				if (i > 0) match.append(" or ");
				match.append("lower(p.name) like :w").append(i).append(" or lower(p.category) like :w").append(i);
			}
			if ("맛집".equals(taste)) match.append(" or p.category like '음식%'");
			var params = new MapSqlParameterSource("area", area)
					.addValue("limit", Math.min(CANDIDATES_PER_TASTE, MAX_CANDIDATES - result.size()))
					.addValue("picked", picked.isEmpty() ? List.of(new UUID(0, 0)) : picked);
			for (int i = 0; i < patterns.size(); i++) params.addValue("w" + i, patterns.get(i));
			// 같은 조건이면 관광공사 자료를 먼저(관광지·카페·맛집 이름이 더 대표성 있다), 그다음 id 순으로 고정한다
			jdbc.query("""
					select p.id, p.name, p.address, p.latitude, p.longitude, p.region_id, p.provider, p.provider_place_id,
					       p.source, p.category
					from places p
					where p.region_id in (:area) and p.category is not null and p.id not in (:picked)
					  and (""" + match + """
					)
					order by case when p.provider = 'KTO' then 0 else 1 end, p.id
					limit :limit""", params, rs -> {
				picked.add(rs.getObject("id", UUID.class));
				result.add(place(rs));
			});
		}
		return result;
	}

	static List<String> words(String taste) {
		return switch (taste) {
			case "카페" -> List.of("카페", "커피");
			case "바다" -> List.of("바다", "해수욕장", "해변");
			case "산책" -> List.of("산책", "공원", "둘레길");
			// '산'은 이름에서 찾으면 '부산'처럼 다른 낱말에 걸린다. 분류의 '>산' 단계만 본다
			case "산" -> List.of(">산");
			default -> List.of(taste);
		};
	}

	private static String escape(String value) {
		return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
	}

	private ArrayNode regions(Set<UUID> ids) {
		ArrayNode regions = jsonMapper.createArrayNode();
		if (ids.isEmpty()) return regions;
		jdbc.query("select id, code, name, parent_id, latitude, longitude from regions where id in (:ids) order by code",
				new MapSqlParameterSource("ids", ids), rs -> {
					ObjectNode r = regions.addObject().put("id", rs.getObject("id", UUID.class).toString())
							.put("code", rs.getString("code")).put("name", rs.getString("name"));
					UUID parent = rs.getObject("parent_id", UUID.class);
					if (parent == null) r.putNull("parentId"); else r.put("parentId", parent.toString());
					putDecimal(r, "latitude", rs.getBigDecimal("latitude"));
					putDecimal(r, "longitude", rs.getBigDecimal("longitude"));
				});
		return regions;
	}

	// AI spec §1.1 Place(백엔드 Place + category)
	private ObjectNode place(ResultSet rs) throws SQLException {
		ObjectNode p = jsonMapper.createObjectNode().put("id", rs.getObject("id", UUID.class).toString())
				.put("name", rs.getString("name"));
		putText(p, "address", rs.getString("address"));
		putDecimal(p, "latitude", rs.getBigDecimal("latitude"));
		putDecimal(p, "longitude", rs.getBigDecimal("longitude"));
		UUID region = rs.getObject("region_id", UUID.class);
		if (region == null) p.putNull("regionId"); else p.put("regionId", region.toString());
		putText(p, "provider", rs.getString("provider"));
		putText(p, "providerPlaceId", rs.getString("provider_place_id"));
		putText(p, "source", rs.getString("source"));
		putText(p, "category", rs.getString("category"));
		return p;
	}

	private static Optional<UUID> regionId(tools.jackson.databind.JsonNode place) {
		var node = place.path("regionId");
		return node.isString() ? Optional.of(UUID.fromString(node.asString())) : Optional.empty();
	}

	private static void putText(ObjectNode node, String field, String value) {
		if (value == null) node.putNull(field); else node.put(field, value);
	}

	private static void putDecimal(ObjectNode node, String field, BigDecimal value) {
		if (value == null) node.putNull(field); else node.put(field, value.doubleValue());
	}

}
