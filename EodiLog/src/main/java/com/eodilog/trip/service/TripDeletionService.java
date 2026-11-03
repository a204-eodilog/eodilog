package com.eodilog.trip.service;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.job.CleanupScope;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobRef;
import com.eodilog.job.JobService;
import com.eodilog.job.JobSubmission;
import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.exception.TripErrorCode;
import com.eodilog.trip.repository.TripRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

// 여행 삭제(정책 §14, Q-11 2026-11-03 확정). 요청 트랜잭션에서 논리 삭제해 즉시 404가 되게 하고,
// 하위 자료의 물리 삭제는 같은 트랜잭션에 등록한 TRIP_DELETE 작업이 한다. 여행 행은 tombstone으로 남는다
@Service
@RequiredArgsConstructor
public class TripDeletionService {

	public static final String REASON_OWNER_DELETE = "OWNER_DELETE";
	public static final String REASON_LAST_MEMBER_LEAVE = "LAST_MEMBER_LEAVE";

	private final TripAccessChecker tripAccessChecker;
	private final TripRepository tripRepository;
	private final JobService jobService;
	private final JsonMapper jsonMapper;
	private final Clock clock;

	// 방장만. 판정 순서: 입력 400 → 여행 행 잠금 후 ACTIVE 404 → 방장 403 → version 409 → 처리(D-1)
	@Transactional
	public JobRef deleteTrip(UUID userId, UUID tripId, Long expectedVersion) {
		if (expectedVersion == null) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.of(new ErrorField("expectedVersion", "삭제 전에 조회한 version을 보내 주세요.")));
		}
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		if (!access.isOwner()) {
			throw new BusinessException(CommonErrorCode.FORBIDDEN, "방장만 여행을 삭제할 수 있습니다.");
		}
		if (access.trip().getVersion() != expectedVersion) {
			throw new BusinessException(TripErrorCode.VERSION_CONFLICT);
		}
		return markDeletedAndSubmit(access.trip(), userId, REASON_OWNER_DELETE);
	}

	// 혼자 남은 사람의 나가기는 여행 삭제다(D-2). 나가기 트랜잭션 안에서 이미 잠근 여행 행으로 호출한다
	@Transactional(propagation = Propagation.MANDATORY)
	public JobRef deleteOnLastMemberLeave(Trip trip, UUID userId) {
		return markDeletedAndSubmit(trip, userId, REASON_LAST_MEMBER_LEAVE);
	}

	private JobRef markDeletedAndSubmit(Trip trip, UUID userId, String reason) {
		Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
		trip.markDeleted(now);
		// 작업 등록 정책이 같은 트랜잭션에서 deleted_at을 읽으므로 먼저 반영한다
		tripRepository.flush();
		ObjectNode input = jsonMapper.createObjectNode()
				.put("tripId", trip.getId().toString())
				.put("reason", reason);
		// 대상은 여행 전체이고 삭제 뒤에는 새 자료가 생길 수 없으므로 개별 ID 목록 없이 cutoff만 고정한다
		return jobService.submit(new JobSubmission(userId, JobKind.TRIP_DELETE, trip.getId(), input,
				trip.getVersion(), new CleanupScope(List.of(), List.of(), now)));
	}

}
