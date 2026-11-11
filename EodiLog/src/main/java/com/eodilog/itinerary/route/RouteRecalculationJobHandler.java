package com.eodilog.itinerary.route;

import com.eodilog.global.ai.AiServerClient;
import com.eodilog.global.ai.AiServerException;
import com.eodilog.itinerary.domain.RouteLegStatus;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobFailure;
import com.eodilog.job.JobHandler;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobOutcome;
import com.eodilog.job.JobSubmission;
import java.sql.Timestamp;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

// ROUTE_RECALCULATION 실행기(EODI-275). 등록 때 고정한 시간 없는 구간을 AI 서버 POST /ai/v1/route-legs(AI spec §5.1)로 보낸다.
// 끝났을 때 코스 version이 요청 때와 같으면 그 구간만 갱신한다. 이동 시간은 사용자가 쓴 내용이 아니라 계산 결과라 version은 올리지 않는다
@Component
@RequiredArgsConstructor
public class RouteRecalculationJobHandler implements JobHandler {

	static final String AI_PATH = "/ai/v1/route-legs";
	// 코스 항목 상한(200)에서 나올 수 있는 구간 수
	static final int MAX_LEGS = 199;
	private static final Set<String> INPUT_FIELDS = Set.of("expectedVersion", "legs");
	private static final Set<String> LEG_FIELDS = Set.of("fromItemId", "toItemId", "day", "fromOrder", "toOrder",
			"transportMode", "from", "to");

	private final AiServerClient aiServerClient;
	private final JdbcTemplate jdbcTemplate;
	private final JsonMapper jsonMapper;

	@Override
	public JobKind kind() {
		return JobKind.ROUTE_RECALCULATION;
	}

	@Override
	public void validate(JobSubmission submission) {
		JsonNode input = submission.input();
		JsonNode legs = input.path("legs");
		boolean fieldsMatch = input.size() == INPUT_FIELDS.size() && INPUT_FIELDS.stream().allMatch(input::has);
		if (submission.tripId() == null || submission.baseVersion() == null || !fieldsMatch
				|| input.get("expectedVersion").asLong() != submission.baseVersion()
				|| !legs.isArray() || legs.isEmpty() || legs.size() > MAX_LEGS) {
			throw new IllegalArgumentException("Invalid ROUTE_RECALCULATION submission");
		}
		for (JsonNode leg : legs) {
			if (leg.size() != LEG_FIELDS.size() || !LEG_FIELDS.stream().allMatch(leg::has)) {
				throw new IllegalArgumentException("Invalid ROUTE_RECALCULATION leg");
			}
		}
	}

	@Override
	public JobOutcome execute(JobContext context) {
		JsonNode input = context.submission().input();
		JsonNode data;
		try {
			// jobId를 추적 ID로 보낸다. AI는 저장하는 것이 없어 같은 jobId로 다시 불려도 안전하다(at-least-once)
			data = aiServerClient.post(AI_PATH, context.jobId(), aiRequest(input));
		} catch (AiServerException ex) {
			// 5xx·연결 실패·타임아웃은 다시 시도한다. 4xx는 같은 입력이면 같은 결과라 바로 실패다
			return JobOutcome.failed(ex.retryable() ? JobFailure.TEMPORARY_FAILURE : JobFailure.EXECUTION_FAILED);
		}
		return RouteRecalculationResult.fromAi(data, input)
				.map(result -> JobOutcome.succeeded(result.toJson(jsonMapper)))
				.orElseGet(() -> JobOutcome.failed(JobFailure.EXECUTION_FAILED));
	}

	// AI는 구간을 day·order로 구분한다. 항목 id는 백엔드에만 둔다
	private JsonNode aiRequest(JsonNode input) {
		ObjectNode body = jsonMapper.createObjectNode();
		ArrayNode legs = body.putArray("legs");
		for (JsonNode leg : input.get("legs")) {
			ObjectNode q = legs.addObject()
					.put("day", leg.get("day").asInt())
					.put("fromOrder", leg.get("fromOrder").asInt())
					.put("toOrder", leg.get("toOrder").asInt())
					.put("transportMode", leg.get("transportMode").asString());
			q.set("from", leg.get("from").deepCopy());
			q.set("to", leg.get("to").deepCopy());
		}
		return body;
	}

	// 결과 트랜잭션 안. 여행 행 → 코스 행 순으로 잠가 코스를 쓰는 다른 경로와 순서를 맞춘다.
	// version이 바뀌었으면 코스가 이미 달라졌으므로 반영하지 않는다(명세: 변경된 코스에는 자동 반영하지 않음).
	// 아직 시간이 없고 요청 때 수단 그대로인 구간만 바꾸므로 같은 작업이 다시 완료돼도 결과가 같다
	@Override
	public void complete(JobContext context, JsonNode result) {
		UUID tripId = context.submission().tripId();
		long baseVersion = context.submission().baseVersion();
		jdbcTemplate.query("select id from trips where id = ? for update", rs -> { }, tripId);
		List<Long> versions = jdbcTemplate.queryForList("select version from itineraries where trip_id = ? for update",
				Long.class, tripId);
		if (versions.size() != 1 || versions.getFirst() != baseVersion) {
			return;
		}
		JsonNode sent = context.submission().input().get("legs");
		RouteRecalculationResult parsed = RouteRecalculationResult.parseStored(result)
				.orElseThrow(() -> new IllegalStateException("Invalid stored route recalculation"));
		for (int i = 0; i < parsed.legs().size(); i++) {
			RouteRecalculationResult.Leg leg = parsed.legs().get(i);
			if (leg.status() != RouteLegStatus.AVAILABLE) {
				continue;
			}
			jdbcTemplate.update("""
					update route_legs set transport_mode = ?, duration_seconds = ?, distance_meters = ?,
					       status = 'AVAILABLE', queried_at = ?
					where itinerary_id = (select id from itineraries where trip_id = ?)
					  and from_item_id = ? and to_item_id = ? and status = 'UNAVAILABLE' and transport_mode = ?""",
					leg.transportMode().name(), leg.durationSeconds(), leg.distanceMeters(),
					Timestamp.from(leg.queriedAt()), tripId, leg.fromItemId(), leg.toItemId(),
					sent.get(i).get("transportMode").asString());
		}
	}

}
