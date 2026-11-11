package com.eodilog.recommendation;

import com.eodilog.global.ai.AiServerClient;
import com.eodilog.global.ai.AiServerException;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobFailure;
import com.eodilog.job.JobHandler;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobOutcome;
import com.eodilog.job.JobSubmission;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// TRIP_RECOMMENDATION 실행기. 등록 때 고정한 입력을 그대로 AI 서버 POST /ai/v1/trip-recommendations(AI spec §4)로 보낸다.
// 추천만 만들고 즐겨찾기·코스를 바꾸지 않으므로 complete에서 할 도메인 쓰기가 없다
@Component
@RequiredArgsConstructor
public class TripRecommendationJobHandler implements JobHandler {

	static final String AI_PATH = "/ai/v1/trip-recommendations";
	static final Set<String> INPUT_FIELDS = Set.of("trip", "members", "savedPlaces", "regions", "excludePlaceIds",
			TripRecommendationSnapshot.AREA_FIELD);

	private final AiServerClient aiServerClient;
	private final TripRecommendationSnapshot snapshot;
	private final JsonMapper jsonMapper;

	@Override
	public JobKind kind() {
		return JobKind.TRIP_RECOMMENDATION;
	}

	@Override
	public void validate(JobSubmission submission) {
		JsonNode input = submission.input();
		boolean fieldsMatch = input.size() == INPUT_FIELDS.size() && INPUT_FIELDS.stream().allMatch(input::has);
		if (submission.tripId() == null || !fieldsMatch || !input.get("trip").isObject()
				|| !input.get("members").isArray() || !input.get("savedPlaces").isArray()
				|| !input.get("regions").isArray() || !input.get(TripRecommendationSnapshot.AREA_FIELD).isArray()) {
			throw new IllegalArgumentException("Invalid TRIP_RECOMMENDATION submission");
		}
	}

	@Override
	public JobOutcome execute(JobContext context) {
		// 후보 장소는 여기서(트랜잭션 밖) 고른다. 다시 실행되면 다시 고르고, 결과는 그때 보낸 후보 안에서만 받는다
		JsonNode body = snapshot.aiRequest(context.submission().input());
		JsonNode data;
		try {
			// jobId를 추적 ID로 보낸다. AI는 저장하는 것이 없어 같은 jobId로 다시 불려도 안전하다(at-least-once)
			data = aiServerClient.post(AI_PATH, context.jobId(), body);
		} catch (AiServerException ex) {
			// 5xx·연결 실패·타임아웃은 다시 시도한다. 4xx는 같은 입력이면 같은 결과라 바로 실패다
			return JobOutcome.failed(ex.retryable() ? JobFailure.TEMPORARY_FAILURE : JobFailure.EXECUTION_FAILED);
		}
		return StoredRecommendation.fromAi(data, body)
				.map(stored -> JobOutcome.succeeded(stored.toStoredJson(jsonMapper)))
				.orElseGet(() -> JobOutcome.failed(JobFailure.EXECUTION_FAILED));
	}

	@Override
	public void complete(JobContext context, JsonNode result) {
		// 도메인 반영 없음. 결과 저장은 공통 기반이 같은 트랜잭션에서 한다
	}

}
