package com.eodilog.invitation.service;

import com.eodilog.chat.service.ChatParticipationService;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.invitation.domain.InvitationToken;
import com.eodilog.invitation.domain.TripInvitation;
import com.eodilog.invitation.dto.InvitationPreviewResponse;
import com.eodilog.invitation.dto.InvitationSecretResponse;
import com.eodilog.invitation.exception.InvitationErrorCode;
import com.eodilog.invitation.repository.TripInvitationRepository;
import com.eodilog.poll.service.PollCloser;
import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.domain.TripMemberStatus;
import com.eodilog.trip.dto.TripResponse;
import com.eodilog.trip.repository.TripMemberRepository;
import com.eodilog.trip.repository.TripRepository;
import com.eodilog.trip.service.TripAccess;
import com.eodilog.trip.service.TripAccessChecker;
import com.eodilog.trip.service.TripResponseAssembler;
import com.eodilog.user.dto.UserCard;
import com.eodilog.user.service.UserCardReader;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class InvitationService {

	// Q-4 기본값(2026-10-30 결정). 정원은 링크별이 아니라 여행의 ACTIVE 멤버 수(방장 포함)다
	public static final Duration EXPIRES_AFTER = Duration.ofDays(7);
	public static final int MAX_ACTIVE_MEMBERS = 20;

	private final TripInvitationRepository tripInvitationRepository;
	private final TripRepository tripRepository;
	private final TripMemberRepository tripMemberRepository;
	private final TripAccessChecker tripAccessChecker;
	private final TripResponseAssembler tripResponseAssembler;
	private final ChatParticipationService chatParticipationService;
	private final UserCardReader userCardReader;
	private final PollCloser pollCloser;
	private final Clock clock;

	// 프론트 초대 화면 경로가 정해지면 환경별로 바꾼다. 기본은 앱 스킴(frontend/app.json)
	@Value("${app.invitation.link-base-url:ieohaeng://invitations/}")
	private String linkBaseUrl;

	// ACTIVE 멤버면 누구나 만든다. 새로 만들면 같은 여행의 이전 링크는 모두 무효가 되어 쓸 수 있는 링크는 늘 하나다
	// 여행 행을 잠가 동시에 발급해도 살아 있는 링크가 둘이 되지 않게 한다
	@Transactional
	public InvitationSecretResponse createInvitation(UUID userId, UUID tripId) {
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		String token = InvitationToken.generate();
		Instant now = now();
		tripInvitationRepository.revokeAllByTripId(tripId, now);
		TripInvitation invitation = tripInvitationRepository.save(TripInvitation.create(tripId,
				access.member().getId(), InvitationToken.hash(token), now.plus(EXPIRES_AFTER), now));
		return new InvitationSecretResponse(invitation.getId(), token, linkBaseUrl + token, invitation.getExpiresAt());
	}

	// 새 링크 없이 이 여행에서 지금 쓸 수 있는 링크를 끊는다. ACTIVE 멤버면 누구나, 쓸 수 있는 링크가 없어도 그대로 성공한다(멱등)
	// 발급·수락과 같은 여행 행 잠금을 잡아, 동시에 들어온 수락은 취소 전에 끝나거나 취소 뒤 INVITATION_REVOKED를 받는다
	@Transactional
	public void cancelInvitations(UUID userId, UUID tripId) {
		tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		tripInvitationRepository.revokeAllByTripId(tripId, now());
	}

	// 로그인하지 않아도 본다. 로그인했으면 viewerId 기준 관계 상태가 담긴 회원 카드를 함께 준다
	// 이미 ACTIVE 멤버면 링크가 만료·무효여도 alreadyMember=true로 보여 준다. 링크 만료·재발급은 기존 참여자에게 영향이 없다
	@Transactional(readOnly = true)
	public InvitationPreviewResponse getPreview(UUID viewerId, String token) {
		LinkedTrip linked = requireLinkedTrip(token, false);
		Trip trip = linked.trip();
		boolean alreadyMember = viewerId != null && tripMemberRepository.findByTripIdAndUserId(trip.getId(), viewerId)
				.filter(TripMember::isActive).isPresent();
		if (!alreadyMember) {
			requireUsable(linked.invitation(), false);
		}
		TripMember inviter = tripMemberRepository.findById(linked.invitation().getCreatedByMemberId())
				.orElseThrow(() -> new IllegalStateException("Invitation has no creator: " + linked.invitation().getId()));
		UUID inviterUserId = inviter.getUserId();
		// 익명은 관계 상태가 필요 없으므로 초대한 사람 기준으로 카드를 읽어 닉네임만 쓴다
		UserCard card = userCardReader.findCards(viewerId != null ? viewerId : inviterUserId, List.of(inviterUserId))
				.get(inviterUserId);
		if (card == null) {
			throw new IllegalStateException("Trip member has no user record: " + inviter.getId());
		}
		return new InvitationPreviewResponse(trip.getTitle(), trip.getStartDate(), trip.getEndDate(),
				new InvitationPreviewResponse.Inviter(card.nickname()), viewerId != null ? card : null,
				linked.invitation().getExpiresAt(), alreadyMember);
	}

	// 형식 404 → 링크·여행 확인 410 → 이미 ACTIVE면 링크 상태와 상관없이 그대로 반환 → 링크 검사 410 → 정원 409 → 참여 순이다
	// 멤버십·채팅 참여·여행 version을 한 트랜잭션에서 바꾼다. 여행 행 잠금으로 정원 검사와 순번 발급이 겹치지 않는다
	@Transactional
	public TripResponse acceptInvitation(UUID userId, String token) {
		LinkedTrip linked = requireLinkedTrip(token, true);
		Trip trip = linked.trip();
		Optional<TripMember> existing = tripMemberRepository.findByTripIdAndUserId(trip.getId(), userId);
		if (existing.filter(TripMember::isActive).isPresent()) {
			return tripResponseAssembler.assemble(userId, trip);
		}
		requireUsable(linked.invitation(), true);
		if (tripMemberRepository.countByTripIdAndStatus(trip.getId(), TripMemberStatus.ACTIVE) >= MAX_ACTIVE_MEMBERS) {
			throw new BusinessException(InvitationErrorCode.TRIP_FULL);
		}

		// 마감 시각이 지난 투표는 멤버가 바뀌기 전 기준으로 먼저 마감한다(정책 §13 V-6b·V-12)
		pollCloser.closeDuePolls(trip.getId());
		Instant now = now();
		long joinOrder = tripMemberRepository.findMaxJoinOrder(trip.getId()) + 1;
		existing.ifPresentOrElse(member -> member.rejoin(joinOrder, now),
				() -> tripMemberRepository.save(TripMember.join(trip.getId(), userId, joinOrder, now)));
		chatParticipationService.joinTripRoom(trip.getId(), userId, now);
		// 응답의 members가 바뀌므로 멤버 관리(M-2)처럼 여행 version을 올린다
		trip.markMembersChanged(now);
		tripRepository.flush();
		return tripResponseAssembler.assemble(userId, trip);
	}

	// 형식이 틀린 토큰은 404. 형식이 맞는데 없는 토큰이거나 여행이 삭제됐으면 410 INVITATION_EXPIRED(명세 §2)
	private LinkedTrip requireLinkedTrip(String token, boolean lockTrip) {
		if (!InvitationToken.isWellFormed(token)) {
			throw new BusinessException(CommonErrorCode.NOT_FOUND);
		}
		TripInvitation invitation = tripInvitationRepository.findByTokenHash(InvitationToken.hash(token))
				.orElseThrow(() -> new BusinessException(InvitationErrorCode.INVITATION_EXPIRED));
		Trip trip = (lockTrip
				? tripRepository.findActiveByIdForUpdate(invitation.getTripId())
				: tripRepository.findByIdAndDeletedAtIsNull(invitation.getTripId()))
				.orElseThrow(() -> new BusinessException(InvitationErrorCode.INVITATION_EXPIRED));
		return new LinkedTrip(invitation, trip);
	}

	// 새 링크로 바뀌었거나 취소됐으면 INVITATION_REVOKED, 기간이 지났거나 초대한 사람이 나갔으면 INVITATION_EXPIRED
	// 무효화는 만료 전 링크에만 하므로, 무효가 된 링크는 나중에 기간이 지나도 먼저 일어난 무효 사유로 알린다
	private void requireUsable(TripInvitation invitation, boolean lockedTrip) {
		// 잠금을 기다리는 사이 새 링크가 발급됐을 수 있어 잠근 뒤에는 DB에서 다시 확인한다
		boolean revoked = invitation.getRevokedAt() != null
				|| (lockedTrip && !tripInvitationRepository.existsByIdAndRevokedAtIsNull(invitation.getId()));
		if (revoked) {
			throw new BusinessException(InvitationErrorCode.INVITATION_REVOKED);
		}
		boolean inviterActive = tripMemberRepository.findById(invitation.getCreatedByMemberId())
				.filter(TripMember::isActive).isPresent();
		if (invitation.isExpiredAt(now()) || !inviterActive) {
			throw new BusinessException(InvitationErrorCode.INVITATION_EXPIRED);
		}
	}

	private Instant now() {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

	private record LinkedTrip(TripInvitation invitation, Trip trip) {
	}

}
