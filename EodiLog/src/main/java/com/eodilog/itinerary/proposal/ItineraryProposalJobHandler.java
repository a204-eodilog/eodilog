package com.eodilog.itinerary.proposal;

import com.eodilog.global.ai.AiServerClient;
import com.eodilog.global.ai.AiServerException;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobFailure;
import com.eodilog.job.JobHandler;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobOutcome;
import com.eodilog.job.JobSubmission;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// ITINERARY_PROPOSAL 실행기(정책 I-11~I-14). 등록 때 고정한 입력을 그대로 AI 요청 본문으로 보낸다(AI spec §5)
// 제안만 만들고 코스는 바꾸지 않으므로 complete에서 할 도메인 쓰기가 없다. 적용은 사용자가 apply로 한다
@Component
@RequiredArgsConstructor
public class ItineraryProposalJobHandler implements JobHandler {

	static final String AI_PATH = "/ai/v1/itinerary-proposals";
	static final Set<String> INPUT_FIELDS = Set.of("reason", "expectedVersion", "trip", "places", "current",
			"defaultTransportMode", "excludedPlaceIds", "selectedAlternative");

	private final AiServerClient aiServerClient;
	private final JsonMapper jsonMapper;
	private final Clock clock;

	@Override
	public JobKind kind() {
		return JobKind.ITINERARY_PROPOSAL;
	}

	@Override
	public void validate(JobSubmission submission) {
		JsonNode input = submission.input();
		boolean fieldsMatch = input.size() == INPUT_FIELDS.size() && INPUT_FIELDS.stream().allMatch(input::has);
		if (submission.tripId() == null || submission.baseVersion() == null || !fieldsMatch
				|| !validReason(input)
				|| input.get("expectedVersion").asLong() != submission.baseVersion()
				|| !input.get("trip").isObject() || !input.get("places").isArray()
				|| !input.get("current").isObject()) {
			throw new IllegalArgumentException("Invalid ITINERARY_PROPOSAL submission");
		}
	}

	// INITIAL은 선택 대안이 없고, WEATHER는 고른 날씨 대안이 있다(정책 W-26)
	private static boolean validReason(JsonNode input) {
		String reason = input.get("reason").asString();
		return ("INITIAL".equals(reason) && input.get("selectedAlternative").isNull())
				|| ("PLACE_REMOVED".equals(reason) && input.get("selectedAlternative").isNull() && input.path("excludedPlaceIds").isArray() && !input.path("excludedPlaceIds").isEmpty())
				|| ("WEATHER".equals(reason) && input.get("selectedAlternative").isObject());
	}

	@Override
	public JobOutcome execute(JobContext context) {
		UUID jobId = context.jobId();
		JsonNode input = context.submission().input();
		JsonNode data;
		try {
			// jobId를 추적 ID로 보낸다. AI는 저장하는 것이 없어 같은 jobId로 다시 불려도 안전하다(at-least-once)
			data = aiServerClient.post(AI_PATH, jobId, input.deepCopy());
		} catch (AiServerException ex) {
			// 5xx·연결 실패·타임아웃은 다시 시도한다. 4xx(422 INSUFFICIENT_DATA 포함)는 같은 입력이면 같은 결과라 바로 실패다(I-12)
			return JobOutcome.failed(ex.retryable() ? JobFailure.TEMPORARY_FAILURE : JobFailure.EXECUTION_FAILED);
		}
		return StoredProposal.fromAi(data, input, clock.instant().truncatedTo(ChronoUnit.MICROS), jsonMapper)
				.map(proposal -> JobOutcome.succeeded(proposal.toJson(jsonMapper)))
				.orElseGet(() -> JobOutcome.failed(JobFailure.EXECUTION_FAILED));
	}

	@Override
	public void complete(JobContext context, JsonNode result) {
		// 도메인 반영 없음. 결과 저장은 공통 기반이 같은 트랜잭션에서 한다
	}

}
