package com.eodilog.visit.candidate;

import com.eodilog.global.ai.AiServerClient;
import com.eodilog.global.ai.AiServerException;
import com.eodilog.global.id.UuidV7;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobFailure;
import com.eodilog.job.JobHandler;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobOutcome;
import com.eodilog.job.JobSubmission;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.place.service.PlaceReader;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * VISIT_DETECTION. 판정은 AI 서버 {@code POST /ai/v1/visit-detections}(AI spec §8.2)가 하고, 백엔드는 보낼 자료를 고르고 결과를 검증한다.
 * <ul>
 * <li>보내는 사진: 요청자가 이 여행에 올린, 삭제되지 않은 READY 사진 중 비공개 EXIF 위치와 촬영 시각이 모두 있는 것만. 시각은 사용자가
 * 지정한 capturedAt(UTC ISO), 없으면 EXIF 촬영 시각을 시간대 없는 현지 시각(AI가 한국 시각으로 봄)으로 보낸다. 서버 시각+5분보다
 * 미래인 사진은 보내지 않는다. uploaderMemberId는 언제나 요청자 멤버십이다.</li>
 * <li>보내는 코스: 지금 여행 코스의 일정과 장소, 여행 시작일. 위치 정보는 작업 입력에 저장하지 않고 실행 때 읽는다.</li>
 * <li>AI 결과 검증: memberId가 요청자 멤버십, placeId가 보낸 코스 장소, evidencePhotoIds가 보낸 사진의 중복 없는 부분집합, visitedAt을
 * 읽을 수 있어야 한다(시간대 없으면 한국 시각). 어긋난 후보는 버리고, 응답 모양이 깨졌으면 작업을 실패시킨다. 이미 체크한 장소는 뺀다.</li>
 * </ul>
 * 후보 행은 완료 트랜잭션에서 여행 행을 잠근 뒤 요청자 권한과 근거 사진을 다시 확인하고 만든다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class VisitDetectionHandler implements JobHandler {

	public static final int MAX_PHOTOS = 50;
	static final String AI_PATH = "/ai/v1/visit-detections";
	static final ZoneId EXIF_ZONE = ZoneId.of("Asia/Seoul");
	private static final Duration FUTURE_TOLERANCE = Duration.ofMinutes(5);
	private static final DateTimeFormatter EXIF_TIME = DateTimeFormatter.ofPattern("yyyy:MM:dd HH:mm:ss");
	private static final DateTimeFormatter NAIVE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
	// 위치가 숫자이고 범위 안인 사진만. 중첩 CASE로 숫자인지 먼저 본 뒤에만 형변환한다(AND는 평가 순서가 보장되지 않는다)
	private static final String EVIDENCE = """
			select p.id, p.captured_at, a.metadata_json->>'capturedAtLocal' as local_time,
			       (a.metadata_json->>'latitude')::double precision as latitude,
			       (a.metadata_json->>'longitude')::double precision as longitude
			from photos p join assets a on a.id = p.asset_id
			where p.id in (:ids) and p.trip_id = :trip and p.uploader_member_id = :member and p.deleted_at is null
			  and a.status = 'READY'
			  and case when jsonb_typeof(a.metadata_json->'latitude') = 'number'
			                and jsonb_typeof(a.metadata_json->'longitude') = 'number'
			           then abs((a.metadata_json->>'latitude')::numeric) <= 90
			                and abs((a.metadata_json->>'longitude')::numeric) <= 180
			           else false end
			order by p.id""";

	private final NamedParameterJdbcTemplate jdbc;
	private final Clock clock;
	private final VisitCandidateAccess access;
	private final AiServerClient ai;
	private final PlaceReader places;
	private final JsonMapper json;

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

	/** 근거로 쓸 수 있는 사진 하나. sentTime은 AI에 보내는 시각 문자열, at은 같은 시각의 UTC 값이다. */
	private record Evidence(UUID photoId, Instant at, String sentTime, double latitude, double longitude) {
	}

	private record Item(UUID id, UUID placeId, int day, int order, String startTime, Integer stayMinutes) {
	}

	@Override
	public JobOutcome execute(JobContext c) {
		var s = c.submission();
		UUID trip = s.tripId();
		UUID member = member(s);
		ObjectNode body;
		List<Evidence> evidence;
		Set<UUID> itemPlaces = new HashSet<>();
		try {
			evidence = evidence(trip, member, requested(s));
			var start = jdbc.queryForList("select start_date from trips where id = :trip and deleted_at is null",
					new MapSqlParameterSource("trip", trip), Date.class);
			List<Item> items = jdbc.query("""
					select ii.id, ii.place_id, ii.day, ii.sequence, ii.start_time, ii.stay_minutes
					from itinerary_items ii join itineraries i on i.id = ii.itinerary_id
					where i.trip_id = :trip order by ii.day, ii.sequence""", new MapSqlParameterSource("trip", trip),
					(rs, row) -> new Item(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getInt(3), rs.getInt(4),
							rs.getString(5), (Integer) rs.getObject(6)));
			// 맞출 사진·코스·기준 날짜가 없으면 AI를 부르지 않고 빈 결과로 끝낸다
			if (evidence.isEmpty() || items.isEmpty() || start.isEmpty() || start.getFirst() == null) {
				return JobOutcome.succeeded(empty());
			}
			Map<UUID, PlaceView> found = places.findAll(items.stream().map(Item::placeId).distinct().toList());
			body = json.createObjectNode().put("tripStartDate", start.getFirst().toLocalDate().toString());
			var photos = body.putArray("photos");
			for (Evidence e : evidence) {
				photos.addObject().put("photoId", e.photoId().toString()).put("uploaderMemberId", member.toString())
						.put("capturedAt", e.sentTime()).put("latitude", e.latitude()).put("longitude", e.longitude());
			}
			var sentItems = body.putArray("items");
			for (Item item : items) {
				PlaceView place = found.get(item.placeId());
				if (place == null) {
					continue;
				}
				itemPlaces.add(item.placeId());
				ObjectNode node = sentItems.addObject().put("id", item.id().toString());
				node.set("place", json.valueToTree(place));
				node.put("day", item.day()).put("order", item.order()).put("startTime", item.startTime());
				if (item.stayMinutes() == null) {
					node.putNull("stayMinutes");
				} else {
					node.put("stayMinutes", item.stayMinutes());
				}
			}
		} catch (DataAccessException ex) {
			log.warn("visit_detection_failed jobId={} category=database exceptionClass={}", c.jobId(), ex.getClass().getSimpleName());
			return JobOutcome.failed(JobFailure.TEMPORARY_FAILURE);
		}
		JsonNode response;
		try {
			response = ai.post(AI_PATH, c.jobId(), body);
		} catch (AiServerException ex) {
			log.warn("visit_detection_failed jobId={} category=infrastructure retryable={}", c.jobId(), ex.retryable());
			return JobOutcome.failed(ex.retryable() ? JobFailure.TEMPORARY_FAILURE : JobFailure.EXECUTION_FAILED);
		}
		if (response == null || !response.path("candidates").isArray()) {
			log.warn("visit_detection_failed jobId={} category=model_response", c.jobId());
			return JobOutcome.failed(JobFailure.EXECUTION_FAILED);
		}
		Set<UUID> sentPhotos = new HashSet<>(evidence.stream().map(Evidence::photoId).toList());
		Map<UUID, Candidate> accepted = new LinkedHashMap<>();
		int dropped = 0;
		for (JsonNode candidate : response.path("candidates")) {
			Candidate valid = Candidate.parse(candidate, member, itemPlaces, sentPhotos);
			if (valid == null || accepted.containsKey(valid.placeId())) {
				dropped++;
			} else {
				accepted.put(valid.placeId(), valid);
			}
		}
		if (dropped > 0) {
			log.warn("visit_detection_candidates_dropped jobId={} count={}", c.jobId(), dropped);
		}
		Set<UUID> visited;
		try {
			visited = accepted.isEmpty() ? Set.of() : new HashSet<>(jdbc.queryForList(
					"select place_id from visits where trip_id=:trip and member_id=:member and deleted_at is null and place_id in (:places)",
					new MapSqlParameterSource().addValue("trip", trip).addValue("member", member).addValue("places", accepted.keySet()),
					UUID.class));
		} catch (DataAccessException ex) {
			return JobOutcome.failed(JobFailure.TEMPORARY_FAILURE);
		}
		ObjectNode result = json.createObjectNode();
		var candidates = result.putArray("candidates");
		for (Candidate candidate : accepted.values()) {
			if (visited.contains(candidate.placeId())) {
				continue;
			}
			var node = candidates.addObject().put("id", UuidV7.generate().toString()).put("placeId", candidate.placeId().toString())
					.put("visitedAt", candidate.visitedAt().toString());
			var ids = node.putArray("evidencePhotoIds");
			candidate.photoIds().forEach(id -> ids.add(id.toString()));
		}
		return JobOutcome.succeeded(result);
	}

	/** AI 후보 하나를 계약대로 검증한다. 어긋나면 null(그 후보만 버린다). */
	private record Candidate(UUID placeId, Instant visitedAt, Set<UUID> photoIds) {

		static Candidate parse(JsonNode node, UUID member, Set<UUID> places, Set<UUID> photos) {
			try {
				UUID memberId = strictUuid(node.path("memberId"));
				UUID placeId = strictUuid(node.path("placeId"));
				Instant visitedAt = aiTime(node.path("visitedAt"));
				var ids = node.path("evidencePhotoIds");
				if (!member.equals(memberId) || !places.contains(placeId) || visitedAt == null || !ids.isArray() || ids.isEmpty()) {
					return null;
				}
				Set<UUID> evidence = new TreeSet<>();
				for (JsonNode id : ids) {
					UUID photo = strictUuid(id);
					if (!photos.contains(photo) || !evidence.add(photo)) {
						return null;
					}
				}
				return new Candidate(placeId, visitedAt, evidence);
			} catch (IllegalArgumentException ex) {
				return null;
			}
		}

	}

	private static UUID strictUuid(JsonNode node) {
		if (node == null || !node.isString()) {
			throw new IllegalArgumentException("Invalid UUID");
		}
		UUID id = UUID.fromString(node.asString());
		if (!id.toString().equalsIgnoreCase(node.asString())) {
			throw new IllegalArgumentException("Invalid UUID");
		}
		return id;
	}

	// AI는 받은 시각을 그대로 돌려주므로 시간대가 없을 수 있다. 그때는 AI와 같이 한국 시각으로 읽는다
	private static Instant aiTime(JsonNode node) {
		if (!node.isString()) {
			return null;
		}
		String value = node.asString();
		try {
			return OffsetDateTime.parse(value).toInstant();
		} catch (DateTimeParseException offsetMissing) {
			try {
				return LocalDateTime.parse(value).atZone(EXIF_ZONE).toInstant();
			} catch (DateTimeParseException ex) {
				return null;
			}
		}
	}

	private static ObjectNode empty() {
		var result = tools.jackson.databind.node.JsonNodeFactory.instance.objectNode();
		result.putArray("candidates");
		return result;
	}

	private static UUID member(JobSubmission s) {
		return UUID.fromString(s.input().path("memberId").asString());
	}

	private static Set<UUID> requested(JobSubmission s) {
		Set<UUID> ids = new TreeSet<>();
		s.input().path("photoIds").forEach(id -> ids.add(UUID.fromString(id.asString())));
		return ids;
	}

	/** 요청자의 살아 있는 사진 중 위치와 유효한 촬영 시각이 모두 있는 것. 실행과 완료가 같은 기준을 쓴다. */
	private List<Evidence> evidence(UUID trip, UUID member, Collection<UUID> ids) {
		Instant latest = clock.instant().plus(FUTURE_TOLERANCE);
		var params = new MapSqlParameterSource().addValue("ids", ids).addValue("trip", trip).addValue("member", member);
		return jdbc.query(EVIDENCE, params, (rs, row) -> {
			Timestamp captured = rs.getTimestamp("captured_at");
			Instant at;
			String sent;
			if (captured != null) {
				at = captured.toInstant();
				sent = at.toString();
			} else {
				LocalDateTime local = exifTime(rs.getString("local_time"));
				at = local == null ? null : local.atZone(EXIF_ZONE).toInstant();
				sent = local == null ? null : local.format(NAIVE_TIME);
			}
			return at == null || at.isAfter(latest) ? null
					: new Evidence(rs.getObject("id", UUID.class), at, sent, rs.getDouble("latitude"), rs.getDouble("longitude"));
		}).stream().filter(Objects::nonNull).toList();
	}

	private static LocalDateTime exifTime(String value) {
		if (value == null) {
			return null;
		}
		try {
			return LocalDateTime.parse(value.trim(), EXIF_TIME);
		} catch (DateTimeParseException ex) {
			return null;
		}
	}

	/**
	 * 여행 행을 잠근 뒤 권한·근거를 다시 확인해 후보를 만든다. 그 사이 나갔거나 설정을 끈 요청자에게는 아무것도 만들지 않는다(작업은 성공).
	 * 근거는 지금도 살아 있고 위치·시각이 남은 사진만 남기고, visitedAt은 남은 근거의 가장 이른 시각으로 다시 계산한다.
	 * 같은 결과를 다시 반영해도 후보 ID가 같아 중복이 생기지 않는다.
	 */
	@Override
	public void complete(JobContext c, JsonNode result) {
		var s = c.submission();
		UUID trip = s.tripId();
		UUID member = member(s);
		jdbc.query("select id from trips where id=:trip for update", new MapSqlParameterSource("trip", trip), rs -> {
		});
		if (!access.allowed(trip, s.requestedByUserId())) {
			return;
		}
		Set<UUID> requested = requested(s);
		Instant now = clock.instant();
		for (var candidate : result.path("candidates")) {
			UUID id = UUID.fromString(candidate.path("id").asString());
			UUID place = UUID.fromString(candidate.path("placeId").asString());
			Set<UUID> photos = new TreeSet<>();
			candidate.path("evidencePhotoIds").forEach(p -> photos.add(UUID.fromString(p.asString())));
			if (photos.isEmpty() || !requested.containsAll(photos)) {
				throw new IllegalArgumentException("Invalid visit detection result");
			}
			var live = evidence(trip, member, photos);
			var params = new MapSqlParameterSource().addValue("trip", trip).addValue("member", member).addValue("place", place)
					.addValue("id", id).addValue("job", c.jobId()).addValue("now", Timestamp.from(now));
			boolean visited = Boolean.TRUE.equals(jdbc.queryForObject(
					"select exists(select 1 from visits where trip_id=:trip and member_id=:member and place_id=:place and deleted_at is null)",
					params, Boolean.class));
			if (live.isEmpty() || visited) {
				continue;
			}
			params.addValue("visitedAt", Timestamp.from(live.stream().map(Evidence::at).min(Instant::compareTo).orElseThrow()));
			jdbc.update("""
					insert into visit_candidates(id,job_id,trip_id,member_id,place_id,visited_at,created_at)
					values(:id,:job,:trip,:member,:place,:visitedAt,:now) on conflict (id) do nothing""", params);
			for (Evidence photo : live) {
				jdbc.update("insert into visit_candidate_photos(candidate_id,photo_id) values(:id,:photo) on conflict do nothing",
						new MapSqlParameterSource().addValue("id", id).addValue("photo", photo.photoId()));
			}
		}
	}

}
