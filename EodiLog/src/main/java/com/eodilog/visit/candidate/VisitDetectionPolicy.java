package com.eodilog.visit.candidate;

import com.eodilog.job.JobAccessPolicy;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobSubmission;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 후보는 요청자 본인의 것이라 결과도 요청자만 본다. 실행·완료마다 현재 ACTIVE 멤버십과 방문 감지 설정을 다시 확인한다.
// 조회는 ACTIVE 멤버십만 본다: 설정을 꺼도 이미 끝난 내 작업 결과는 볼 수 있고, 확정은 VisitCandidateService가 설정 OFF로 막는다
@Component
@RequiredArgsConstructor
public class VisitDetectionPolicy implements JobAccessPolicy {

	private final VisitCandidateAccess access;
	private final VisitCandidateStore store;
	private final JsonMapper json;

	@Override
	public JobKind kind() {
		return JobKind.VISIT_DETECTION;
	}

	@Override
	public boolean canSubmit(JobSubmission s) {
		return access.allowed(s.tripId(), s.requestedByUserId());
	}

	@Override
	public boolean canExecute(JobContext c) {
		return canSubmit(c.submission());
	}

	@Override
	public boolean canComplete(JobContext c) {
		return canSubmit(c.submission());
	}

	@Override
	public boolean canRead(UUID viewer, JobContext c) {
		return viewer.equals(c.submission().requestedByUserId()) && access.active(c.submission().tripId(), viewer);
	}

	// 저장된 결과 대신 이 작업이 만든 후보 행의 현재 상태(확정·무효화 반영)를 돌려준다. 입력 스냅샷·GPS는 내보내지 않는다
	@Override
	public JsonNode publicResult(UUID viewer, JobContext c, JsonNode stored) {
		var result = json.createObjectNode();
		result.set("candidates", json.valueToTree(store.findByJob(c.jobId())));
		return result;
	}

}
