package com.eodilog.checklist.suggestion;

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
import tools.jackson.databind.node.ObjectNode;

// CHECKLIST_SUGGESTIONS 실행기(정책 S-4·S-7·S-8). 등록 때 고정한 입력만 AI에 보내고 재시도 때 다시 읽지 않는다
// 제안만 만들고 준비물은 바꾸지 않으므로 complete에서 할 도메인 쓰기가 없다. 채택은 사용자가 checklist POST로 한다
@Component
@RequiredArgsConstructor
public class ChecklistSuggestionJobHandler implements JobHandler {

	static final String AI_PATH = "/ai/v1/checklist-suggestions";
	static final Set<String> INPUT_FIELDS = Set.of("trip", "items", "existingItems", "deletedLabels");

	private final AiServerClient aiServerClient;

	@Override
	public JobKind kind() {
		return JobKind.CHECKLIST_SUGGESTIONS;
	}

	@Override
	public void validate(JobSubmission submission) {
		JsonNode input = submission.input();
		boolean fieldsMatch = input.size() == INPUT_FIELDS.size() && INPUT_FIELDS.stream().allMatch(input::has);
		if (submission.tripId() == null || submission.baseVersion() != null || !fieldsMatch
				|| !input.get("trip").isObject() || !input.get("items").isArray()
				|| !input.get("existingItems").isArray() || !input.get("deletedLabels").isArray()) {
			throw new IllegalArgumentException("Invalid CHECKLIST_SUGGESTIONS submission");
		}
	}

	@Override
	public JobOutcome execute(JobContext context) {
		UUID jobId = context.jobId();
		// AI spec §7 요청. 백엔드에 날씨 조회가 없어 weather는 빈 배열이다(정책 S-4)
		// validate가 객체임을 확인했다
		ObjectNode body = (ObjectNode) context.submission().input().deepCopy();
		body.put("jobId", jobId.toString());
		body.putArray("weather");

		JsonNode data;
		try {
			// jobId를 추적 ID로 보낸다. AI는 저장하는 것이 없어 같은 jobId로 다시 불려도 안전하다(at-least-once)
			data = aiServerClient.post(AI_PATH, jobId, body);
		} catch (AiServerException ex) {
			return JobOutcome.failed(ex.retryable() ? JobFailure.TEMPORARY_FAILURE : JobFailure.EXECUTION_FAILED);
		}
		// 형식이 어긋난 응답은 다시 불러도 같을 가능성이 커서 재시도하지 않는다(정책 S-8). 빈 items는 성공이다(S-17)
		return ChecklistSuggestionResult.sanitize(data, jobId)
				.map(result -> JobOutcome.succeeded(result.toJson(jobId)))
				.orElseGet(() -> JobOutcome.failed(JobFailure.EXECUTION_FAILED));
	}

	@Override
	public void complete(JobContext context, JsonNode result) {
		// 도메인 반영 없음. 결과 저장은 공통 기반이 같은 트랜잭션에서 한다
	}

}
