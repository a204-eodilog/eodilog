package com.eodilog.trip.service;

import com.eodilog.chat.service.OwnMessageCleaner;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobHandler;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobOutcome;
import com.eodilog.job.JobSubmission;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// LEAVE_CLEANUP 실행기(정책 §15). 지금 대상은 메시지 본문뿐이라 외부 I/O가 없다. execute는 결과만 만들고,
// 본문 제거는 작업 행을 잠근 complete에서 같은 트랜잭션으로 한다(TRIP_DELETE와 같은 방식). 사진 파일 삭제가 생기면 execute에 들어간다
// 고정한 ID 중 아직 지우지 않은 것만 지우므로 같은 jobId로 다시 실행돼도 멱등하다
@Component
@RequiredArgsConstructor
public class LeaveCleanupJobHandler implements JobHandler {

	private final OwnMessageCleaner ownMessageCleaner;
	private final JsonMapper jsonMapper;
	private final Clock clock;

	@Override
	public JobKind kind() {
		return JobKind.LEAVE_CLEANUP;
	}

	@Override
	public void validate(JobSubmission submission) {
		JsonNode input = submission.input();
		if (submission.tripId() == null || input.size() != 1
				|| !submission.tripId().toString().equals(input.path("tripId").asString())
				|| !submission.cleanupScope().photoIds().isEmpty() || submission.cleanupScope().messageIds().isEmpty()) {
			throw new IllegalArgumentException("Invalid LEAVE_CLEANUP submission");
		}
	}

	@Override
	public JobOutcome execute(JobContext context) {
		// completedCount는 정리를 승인한 메시지 수다. 그 사이 여행 삭제로 먼저 사라진 메시지도 지워진 것으로 센다
		return JobOutcome.succeeded(jsonMapper.createObjectNode()
				.put("scope", JobKind.LEAVE_CLEANUP.name())
				.put("completedCount", context.submission().cleanupScope().messageIds().size())
				.put("failedCount", 0));
	}

	@Override
	public void complete(JobContext context, JsonNode result) {
		JobSubmission submission = context.submission();
		ownMessageCleaner.removeBodies(submission.cleanupScope().messageIds(), submission.requestedByUserId(),
				clock.instant().truncatedTo(ChronoUnit.MICROS));
	}

}
