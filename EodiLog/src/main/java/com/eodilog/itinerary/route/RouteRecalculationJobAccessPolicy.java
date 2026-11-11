package com.eodilog.itinerary.route;

import com.eodilog.itinerary.proposal.ItineraryProposalAccess;
import com.eodilog.job.JobAccessPolicy;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobSubmission;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// ROUTE_RECALCULATION 권한(명세 §9 AI 작업 권한표). 등록·실행·완료: 요청자가 삭제 안 된 여행의 ACTIVE 멤버. 깨지면 CANCELLED.
// 조회: 공동 코스의 결과이므로 그 여행의 현재 ACTIVE 멤버 누구나. 요청자도 나가면 볼 수 없다. 코스 AI 설정·동의 열은 없다
@Component
@RequiredArgsConstructor
public class RouteRecalculationJobAccessPolicy implements JobAccessPolicy {

	private final ItineraryProposalAccess access;
	private final JsonMapper jsonMapper;

	@Override
	public JobKind kind() {
		return JobKind.ROUTE_RECALCULATION;
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

	// 저장할 때 이미 허용 필드만 남겼지만, 공개 직전에도 같은 규칙으로 다시 고른다. 좌표 입력은 내보내지 않는다
	@Override
	public JsonNode publicResult(UUID viewerUserId, JobContext context, JsonNode storedResult) {
		return RouteRecalculationResult.parseStored(storedResult)
				.orElseThrow(() -> new IllegalStateException("Invalid stored route recalculation"))
				.toJson(jsonMapper);
	}

}
