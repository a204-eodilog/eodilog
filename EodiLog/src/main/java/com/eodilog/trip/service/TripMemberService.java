package com.eodilog.trip.service;

import com.eodilog.chat.service.ChatParticipationService;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.job.JobRef;
import com.eodilog.poll.service.PollCloser;
import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.dto.LeaveTripRequest;
import com.eodilog.trip.dto.LeaveTripResponse;
import com.eodilog.trip.dto.OwnerTransferRequest;
import com.eodilog.trip.dto.TripMemberResponse;
import com.eodilog.trip.dto.TripMembersResponse;
import com.eodilog.trip.dto.TripResponse;
import com.eodilog.trip.exception.TripErrorCode;
import com.eodilog.trip.repository.TripMemberRepository;
import com.eodilog.trip.repository.TripRepository;
import com.eodilog.user.dto.UserCard;
import com.eodilog.user.service.UserCardReader;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 멤버 목록과 방장 전용 관리(양도·내보내기). 방장 권한은 Security 역할이 아니라 여기서 판단한다(A·B 계약 §4)
// 양도·내보내기는 여행 행을 잠근 뒤 trips.version으로 비교해 정보 수정·다른 멤버 변경과 순서를 맞춘다
@Service
@RequiredArgsConstructor
public class TripMemberService {

	private final TripRepository tripRepository;
	private final TripMemberRepository tripMemberRepository;
	private final TripAccessChecker tripAccessChecker;
	private final TripResponseAssembler tripResponseAssembler;
	private final UserCardReader userCardReader;
	private final ChatParticipationService chatParticipationService;
	private final PollCloser pollCloser;
	private final TripDeletionService tripDeletionService;
	private final Clock clock;

	// 기본은 ACTIVE 멤버만. 정산에 남는 이탈 멤버를 보려면 includeInactive로 LEFT·REMOVED도 포함한다(명세 §4)
	@Transactional(readOnly = true)
	public TripMembersResponse getMembers(UUID userId, UUID tripId, boolean includeInactive) {
		Trip trip = tripAccessChecker.requireActiveMember(tripId, userId).trip();
		List<TripMember> members = tripMemberRepository.findAllByTripIdOrderByJoinOrder(tripId).stream()
				.filter(member -> includeInactive || member.isActive())
				.toList();
		Map<UUID, UserCard> cards = userCardReader.findCards(userId,
				members.stream().map(TripMember::getUserId).toList());
		List<TripMemberResponse> responses = members.stream()
				.map(member -> TripMemberResponse.of(member, requireCard(cards, member), trip.getOwnerUserId()))
				.toList();
		return new TripMembersResponse(responses);
	}

	// 기본 나가기(정책 §11). 경비·사진·메시지는 남기고 멤버십 LEFT와 채팅 참여 종료를 한 트랜잭션에서 처리한다
	// 판정 순서: 입력 400(누락·삭제 옵션 true) → 여행 행 잠금 후 ACTIVE 멤버 404 → version 409 → 처리
	// 방장이 나가면 남은 ACTIVE 멤버 중 참여 순이 가장 빠른 사람이 방장이 된다. 어느 경우든 여행 version은 1만 오른다
	// 혼자 남은 사람이 나가면 여행 삭제로 접수한다(정책 §14 D-2): 논리 삭제 + TRIP_DELETE 작업, 202
	@Transactional
	public LeaveTripResponse leave(UUID userId, UUID tripId, LeaveTripRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		requireDeleteOptionOff(request.deleteOwnPhotos(), "deleteOwnPhotos", "사진을", errors);
		requireDeleteOptionOff(request.deleteOwnMessages(), "deleteOwnMessages", "메시지를", errors);
		if (request.expectedVersion() == null) {
			errors.add(new ErrorField("expectedVersion", "나가기 전에 조회한 version을 보내 주세요."));
		}
		throwIfInvalid(errors);

		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		Trip trip = access.trip();
		if (trip.getVersion() != request.expectedVersion()) {
			throw new BusinessException(TripErrorCode.VERSION_CONFLICT);
		}
		List<TripMember> others = tripMemberRepository.findAllByTripIdOrderByJoinOrder(tripId).stream()
				.filter(member -> member.isActive() && !member.getId().equals(access.member().getId()))
				.toList();
		// 방장은 내보낼 수 없고 나가면 자동 양도되므로 늘 ACTIVE다. 따라서 혼자 남은 사람은 방장이며,
		// 이 불변식이 깨져도 마지막 한 명의 나가기는 여행 삭제로 처리하는 쪽이 자료를 남기지 않아 안전하다
		if (others.isEmpty()) {
			Instant now = now();
			access.member().leave(now);
			chatParticipationService.leaveTripRoom(tripId, userId, now);
			JobRef cleanup = tripDeletionService.deleteOnLastMemberLeave(trip, userId);
			return LeaveTripResponse.tripDeleted(tripId, cleanup.jobId());
		}

		// 마감 시각이 지난 투표는 멤버가 바뀌기 전 기준으로 먼저 마감한다(정책 §13 V-6b·V-12)
		pollCloser.closeDuePolls(tripId);
		Instant now = now();
		access.member().leave(now);
		chatParticipationService.leaveTripRoom(tripId, userId, now);
		TripMember newOwner = null;
		if (access.isOwner()) {
			newOwner = others.getFirst();
			trip.transferOwner(newOwner.getUserId(), now);
		} else {
			trip.markMembersChanged(now);
		}
		tripRepository.flush();
		return LeaveTripResponse.left(tripId, newOwner == null ? null : newOwner.getId());
	}

	// 삭제 기능이 생기기 전에는 false만 받는다. 무시하고 성공으로 응답하지 않는다(정책 §11 L-3, 준비물 C-1과 같은 방식)
	private void requireDeleteOptionOff(Boolean option, String field, String targetWithParticle, List<ErrorField> errors) {
		if (option == null) {
			errors.add(new ErrorField(field, "내 " + targetWithParticle + " 지울지 true/false로 보내 주세요."));
		} else if (option) {
			errors.add(new ErrorField(field,
					"나갈 때 내 " + targetWithParticle + " 지우는 기능은 아직 지원하지 않습니다. false로 보내 주세요."));
		}
	}

	// 방장 알림은 만들지 않는다(명세 §9, 결정 F-21)
	@Transactional
	public TripResponse transferOwner(UUID userId, UUID tripId, OwnerTransferRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		if (request.expectedVersion() == null) {
			errors.add(new ErrorField("expectedVersion", "변경 전에 조회한 version을 보내 주세요."));
		}
		if (request.targetMemberId() == null) {
			errors.add(new ErrorField("targetMemberId", "새 방장을 골라 주세요."));
		}
		throwIfInvalid(errors);

		Trip trip = requireOwnerForUpdate(tripId, userId, request.expectedVersion());
		TripMember target = tripMemberRepository.findById(request.targetMemberId())
				.filter(member -> member.getTripId().equals(tripId) && member.isActive())
				.orElseThrow(() -> invalid("targetMemberId", "같은 여행의 동행에게만 넘길 수 있습니다."));
		if (target.getUserId().equals(trip.getOwnerUserId())) {
			throw invalid("targetMemberId", "이미 방장입니다. 다른 동행을 골라 주세요.");
		}

		trip.transferOwner(target.getUserId(), now());
		tripRepository.flush();
		return tripResponseAssembler.assemble(userId, trip);
	}

	// 멤버십을 REMOVED로 바꾸고 채팅 참여를 함께 끝낸다. 내보낸 사람의 자료 삭제 여부는 Q-11 전이라 건드리지 않는다
	@Transactional
	public void removeMember(UUID userId, UUID tripId, UUID memberId, Long expectedVersion) {
		if (expectedVersion == null) {
			throw invalid("expectedVersion", "변경 전에 조회한 version을 보내 주세요.");
		}

		Trip trip = requireOwnerForUpdate(tripId, userId, expectedVersion);
		TripMember target = tripMemberRepository.findById(memberId)
				.filter(member -> member.getTripId().equals(tripId) && member.isActive())
				.orElseThrow(() -> new BusinessException(TripErrorCode.MEMBER_NOT_FOUND));
		// 호출자가 방장이므로 "본인 내보내기"와 "방장 내보내기"는 같은 경우다. 방장은 나가기(이탈)로만 빠진다
		if (target.getUserId().equals(trip.getOwnerUserId())) {
			throw invalid("memberId", "방장은 내보낼 수 없습니다. 여행에서 나가려면 나가기를 이용해 주세요.");
		}

		// 마감 시각이 지난 투표는 멤버가 바뀌기 전 기준으로 먼저 마감한다(정책 §13 V-6b·V-12)
		pollCloser.closeDuePolls(tripId);
		Instant now = now();
		target.remove(now);
		chatParticipationService.leaveTripRoom(tripId, target.getUserId(), now);
		trip.markMembersChanged(now);
		tripRepository.flush();
	}

	// 비참여자는 존재를 숨겨 404, 참여자지만 방장이 아니면 403, 그다음 버전을 비교한다
	private Trip requireOwnerForUpdate(UUID tripId, UUID userId, long expectedVersion) {
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		if (!access.isOwner()) {
			throw new BusinessException(CommonErrorCode.FORBIDDEN, "방장만 할 수 있습니다.");
		}
		if (access.trip().getVersion() != expectedVersion) {
			throw new BusinessException(TripErrorCode.VERSION_CONFLICT);
		}
		return access.trip();
	}

	private UserCard requireCard(Map<UUID, UserCard> cards, TripMember member) {
		UserCard card = cards.get(member.getUserId());
		if (card == null) {
			throw new IllegalStateException("Trip member has no user record: " + member.getId());
		}
		return card;
	}

	private Instant now() {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

	private BusinessException invalid(String field, String message) {
		return new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
				List.of(new ErrorField(field, message)));
	}

	private void throwIfInvalid(List<ErrorField> errors) {
		if (!errors.isEmpty()) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.copyOf(errors));
		}
	}

}
