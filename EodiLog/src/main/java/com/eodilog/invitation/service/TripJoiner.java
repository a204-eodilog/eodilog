package com.eodilog.invitation.service;

import com.eodilog.chat.service.ChatParticipationService;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.invitation.exception.InvitationErrorCode;
import com.eodilog.poll.service.PollCloser;
import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.domain.TripMemberStatus;
import com.eodilog.trip.repository.TripMemberRepository;
import com.eodilog.trip.repository.TripRepository;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 링크 초대·앱 내 친구 초대가 같이 쓰는 참여 처리. 정원 검사 → 지난 투표 마감 → 멤버십 → 채팅 참여 → 여행 version → 참여 알림 순이다
// 부르는 쪽이 여행 행을 잠근 트랜잭션 안에서 부른다. 잠금 아래에서 정원 검사와 순번 발급이 겹치지 않는다
@Component
@RequiredArgsConstructor
public class TripJoiner {

	// Q-4 기본값(2026-10-30 결정). 정원은 여행의 ACTIVE 멤버 수(방장 포함)다
	public static final int MAX_ACTIVE_MEMBERS = 20;

	private final TripRepository tripRepository;
	private final TripMemberRepository tripMemberRepository;
	private final ChatParticipationService chatParticipationService;
	private final PollCloser pollCloser;
	private final InvitationNotifier invitationNotifier;

	public void requireSeat(UUID tripId) {
		if (tripMemberRepository.countByTripIdAndStatus(tripId, TripMemberStatus.ACTIVE) >= MAX_ACTIVE_MEMBERS) {
			throw new BusinessException(InvitationErrorCode.TRIP_FULL);
		}
	}

	// existing은 이 여행에 남은 이 회원의 멤버십(나갔거나 내보낸 행)이다. 있으면 그 행을 다시 쓰고 순번은 맨 뒤로 받는다
	@Transactional(propagation = Propagation.MANDATORY)
	public TripMember join(Trip trip, UUID userId, Optional<TripMember> existing, Instant now) {
		requireSeat(trip.getId());
		// 마감 시각이 지난 투표는 멤버가 바뀌기 전 기준으로 먼저 마감한다(정책 §13 V-6b·V-12)
		pollCloser.closeDuePolls(trip.getId());
		long joinOrder = tripMemberRepository.findMaxJoinOrder(trip.getId()) + 1;
		TripMember member = existing.map(left -> {
			left.rejoin(joinOrder, now);
			return left;
		}).orElseGet(() -> tripMemberRepository.save(TripMember.join(trip.getId(), userId, joinOrder, now)));
		chatParticipationService.joinTripRoom(trip.getId(), userId, now);
		// 응답의 members가 바뀌므로 멤버 관리(M-2)처럼 여행 version을 올린다
		trip.markMembersChanged(now);
		tripRepository.flush();
		invitationNotifier.memberJoined(member);
		return member;
	}

}
