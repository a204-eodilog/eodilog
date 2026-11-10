package com.eodilog.weather.alternative;

import com.eodilog.global.ai.AiServerClient;
import com.eodilog.global.ai.AiServerException;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobFailure;
import com.eodilog.job.JobHandler;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobOutcome;
import com.eodilog.job.JobSubmission;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// WEATHER_ALTERNATIVES 실행기(정책 W-20~W-23). 등록 때 고정한 입력(날씨 포함)을 그대로 AI 요청 본문으로 보낸다(AI spec §6)
// 제안만 만들고 코스는 바꾸지 않으므로 complete에서 할 도메인 쓰기가 없다. 코스 반영은 WEATHER 코스 제안 → apply로 한다
@Component
@RequiredArgsConstructor
public class WeatherAlternativeJobHandler implements JobHandler {

	static final String AI_PATH = "/ai/v1/weather-alternatives";
	static final Set<String> INPUT_FIELDS = Set.of("date", "placeId", "expectedVersion", "weather", "dayItems",
			"alternativePool", "defaultTransportMode");

	private final AiServerClient aiServerClient;
	private final JsonMapper jsonMapper;

	@Override
	public JobKind kind() {
		return JobKind.WEATHER_ALTERNATIVES;
	}

	@Override
	public void validate(JobSubmission submission) {
		JsonNode input = submission.input();
		boolean fieldsMatch = input.size() == INPUT_FIELDS.size() && INPUT_FIELDS.stream().allMatch(input::has);
		if (submission.tripId() == null || submission.baseVersion() == null || !fieldsMatch
				|| input.get("expectedVersion").asLong() != submission.baseVersion()
				|| !input.get("weather").isObject() || !input.get("dayItems").isArray()
				|| input.get("dayItems").isEmpty() || !input.get("alternativePool").isArray()) {
			throw new IllegalArgumentException("Invalid WEATHER_ALTERNATIVES submission");
		}
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
			return JobOutcome.failed(ex.retryable() ? JobFailure.TEMPORARY_FAILURE : JobFailure.EXECUTION_FAILED);
		}
		// 형식이 어긋난 응답은 다시 불러도 같을 가능성이 커서 재시도하지 않는다. 빈 alternatives는 성공이다(W-23)
		return WeatherAlternativeResult.fromAi(data, input, jsonMapper)
				.map(JobOutcome::succeeded)
				.orElseGet(() -> JobOutcome.failed(JobFailure.EXECUTION_FAILED));
	}

	@Override
	public void complete(JobContext context, JsonNode result) {
		// 도메인 반영 없음. 결과 저장은 공통 기반이 같은 트랜잭션에서 한다
	}

}
