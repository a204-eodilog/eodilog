package com.eodilog.itinerary.proposal;

import com.eodilog.job.JobAccessPolicy;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobSubmission;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// ITINERARY_PROPOSAL 권한(명세 §9 AI 작업 권한표, 정책 I-10)
// 등록·실행·완료: 요청자가 삭제 안 된 여행의 ACTIVE 멤버. 깨지면 CANCELLED. 실행 중 코스가 바뀌어도 막지 않는다(apply가 409로 막음, I-11)
// 조회: 공동 코스의 제안이므로 그 여행의 현재 ACTIVE 멤버 누구나. 요청자도 나가면 볼 수 없다
@Component
@RequiredArgsConstructor
public class ItineraryProposalJobAccessPolicy implements JobAccessPolicy {

	private final ItineraryProposalAccess access;
	private final JsonMapper jsonMapper;

	@Override
	public JobKind kind() {
		return JobKind.ITINERARY_PROPOSAL;
	}

	@Override
	public boolean canSubmit(JobSubmission submission) {
		return access.activeMember(submission.tripId(), submission.requestedByUserId());
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

	// 저장할 때 이미 허용 필드만 남겼지만, 공개 직전에도 같은 규칙으로 다시 고른다
	@Override
	public JsonNode publicResult(UUID viewerUserId, JobContext context, JsonNode storedResult) {
		return StoredProposal.parseStored(storedResult, jsonMapper)
				.orElseThrow(() -> new IllegalStateException("Invalid stored itinerary proposal"))
				.toJson(jsonMapper);
	}

}
