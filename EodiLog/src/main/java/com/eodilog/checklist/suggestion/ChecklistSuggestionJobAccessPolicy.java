package com.eodilog.checklist.suggestion;

import com.eodilog.job.JobAccessPolicy;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobSubmission;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

// CHECKLIST_SUGGESTIONS 권한(명세 §9 AI 작업 권한표, 정책 S-5·S-6)
// 등록·실행·완료: 요청자가 삭제 안 된 여행의 ACTIVE 멤버이고 준비물 추천 설정이 OFF가 아니어야 한다. 깨지면 CANCELLED
// 조회: 공동 목록의 제안이므로 그 여행의 현재 ACTIVE 멤버 누구나. 요청자도 나가면 볼 수 없다
@Component
@RequiredArgsConstructor
public class ChecklistSuggestionJobAccessPolicy implements JobAccessPolicy {

	private final ChecklistSuggestionAccess access;

	@Override
	public JobKind kind() {
		return JobKind.CHECKLIST_SUGGESTIONS;
	}

	@Override
	public boolean canSubmit(JobSubmission submission) {
		return access.requesterAllowed(submission.tripId(), submission.requestedByUserId());
	}

	@Override
	public boolean canExecute(JobContext context) {
		return canSubmit(context.submission());
	}

	@Override
	public boolean canComplete(JobContext context) {
		return canSubmit(context.submission());
	}

	@Override
	public boolean canRead(UUID viewerUserId, JobContext context) {
		return access.activeMember(context.submission().tripId(), viewerUserId);
	}

	// 저장할 때 이미 허용 필드만 남겼지만, 공개 직전에도 label·reason·sourceJobId만 다시 고른다
	@Override
	public JsonNode publicResult(UUID viewerUserId, JobContext context, JsonNode storedResult) {
		return ChecklistSuggestionResult.sanitize(storedResult, context.jobId())
				.orElseThrow(() -> new IllegalStateException("Invalid stored checklist suggestions"))
				.toJson(context.jobId());
	}

}
