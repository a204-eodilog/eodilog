package com.eodilog.trip.service;

import com.eodilog.chat.service.OwnMessageCleaner;
import com.eodilog.job.CleanupScope;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobRef;
import com.eodilog.job.JobService;
import com.eodilog.job.JobSubmission;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

// 나가기 삭제 옵션의 정리 작업 등록(정책 §15). 지울 대상은 나가기 트랜잭션에서 ID로 고정하고, 재시도에서 새 대상을 찾지 않는다
// 지울 것이 없으면 작업을 만들지 않는다(가짜 작업 ID를 반환하지 않는다, 정책 §11 L-2)
@Service
@RequiredArgsConstructor
public class LeaveCleanupService {

	private final OwnMessageCleaner ownMessageCleaner;
	private final JobService jobService;
	private final JsonMapper jsonMapper;

	// 멤버십을 LEFT로 바꾼 나가기 트랜잭션 안에서 호출한다. 작업 등록 정책이 같은 트랜잭션에서 LEFT를 읽으므로 먼저 flush해 둔다
	@Transactional(propagation = Propagation.MANDATORY)
	public Optional<JobRef> submitMessageCleanup(UUID tripId, UUID userId, Instant cutoffAt) {
		List<UUID> messageIds = ownMessageCleaner.findOwnMessageIds(tripId, userId);
		if (messageIds.isEmpty()) {
			return Optional.empty();
		}
		return Optional.of(jobService.submit(new JobSubmission(userId, JobKind.LEAVE_CLEANUP, tripId,
				jsonMapper.createObjectNode().put("tripId", tripId.toString()), null,
				new CleanupScope(List.of(), messageIds, cutoffAt))));
	}

}
