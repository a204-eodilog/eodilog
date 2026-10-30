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
	private final Clock clock;

	// 프론트 초대 화면 경로가 정해지면 환경별로 바꾼다. 기본은 앱 스킴(frontend/app.json)
	@Value("${app.invitation.link-base-url:ieohaeng://invitations/}")
	private String linkBaseUrl;

	// ACTIVE 멤버면 누구나 만든다. 같은 여행에 여러 링크가 있어도 각자 만료까지 쓸 수 있다
	@Transactional
	public InvitationSecretResponse createInvitation(UUID userId, UUID tripId) {
		TripAccess access = tripAccessChecker.requireActiveMember(tripId, userId);
		String token = InvitationToken.generate();
		Instant now = now();
		TripInvitation invitation = tripInvitationRepository.save(TripInvitation.create(tripId,
				access.member().getId(), InvitationToken.hash(token), now.plus(EXPIRES_AFTER), now));
		return new InvitationSecretResponse(invitation.getId(), token, linkBaseUrl + token, invitation.getExpiresAt());
	}

	// 로그인하지 않아도 본다. 로그인했으면 viewerId 기준 관계 상태가 담긴 회원 카드를 함께 준다
	@Transactional(readOnly = true)
	public InvitationPreviewResponse getPreview(UUID viewerId, String token) {
		UsableInvitation usable = requireUsable(token, false);
		UUID inviterUserId = usable.inviter().getUserId();
		// 익명은 관계 상태가 필요 없으므로 초대한 사람 기준으로 카드를 읽어 닉네임만 쓴다
		UserCard card = userCardReader.findCards(viewerId != null ? viewerId : inviterUserId, List.of(inviterUserId))
				.get(inviterUserId);
		if (card == null) {
			throw new IllegalStateException("Trip member has no user record: " + usable.inviter().getId());
		}
		Trip trip = usable.trip();
		return new InvitationPreviewResponse(trip.getTitle(), trip.getStartDate(), trip.getEndDate(),
				new InvitationPreviewResponse.Inviter(card.nickname()), viewerId != null ? card : null,
				usable.invitation().getExpiresAt());
	}

	// 링크 검사(410) → 이미 ACTIVE면 그대로 반환 → 정원(409) → 새 참여 또는 재참여 순이다
	// 멤버십·채팅 참여·여행 version을 한 트랜잭션에서 바꾼다. 여행 행 잠금으로 정원 검사와 순번 발급이 겹치지 않는다
	@Transactional
	public TripResponse acceptInvitation(UUID userId, String token) {
		UsableInvitation usable = requireUsable(token, true);
		Trip trip = usable.trip();
		Optional<TripMember> existing = tripMemberRepository.findByTripIdAndUserId(trip.getId(), userId);
		if (existing.filter(TripMember::isActive).isPresent()) {
			return tripResponseAssembler.assemble(userId, trip);
		}
		if (tripMemberRepository.countByTripIdAndStatus(trip.getId(), TripMemberStatus.ACTIVE) >= MAX_ACTIVE_MEMBERS) {
			throw new BusinessException(InvitationErrorCode.TRIP_FULL);
		}

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

	// 형식이 틀린 토큰은 404, 형식이 맞는 토큰의 검증 실패는 모두 410으로 같게 응답한다(명세 §2)
	private UsableInvitation requireUsable(String token, boolean lockTrip) {
		if (!InvitationToken.isWellFormed(token)) {
			throw new BusinessException(CommonErrorCode.NOT_FOUND);
		}
		TripInvitation invitation = tripInvitationRepository.findByTokenHash(InvitationToken.hash(token))
				.orElseThrow(InvitationService::expired);
		Trip trip = (lockTrip
				? tripRepository.findActiveByIdForUpdate(invitation.getTripId())
				: tripRepository.findByIdAndDeletedAtIsNull(invitation.getTripId()))
				.orElseThrow(InvitationService::expired);
		if (!invitation.isUsableAt(now())) {
			throw expired();
		}
		TripMember inviter = tripMemberRepository.findById(invitation.getCreatedByMemberId())
				.filter(TripMember::isActive)
				.orElseThrow(InvitationService::expired);
		return new UsableInvitation(invitation, trip, inviter);
	}

	private static BusinessException expired() {
		return new BusinessException(InvitationErrorCode.INVITATION_EXPIRED);
	}

	private Instant now() {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

	private record UsableInvitation(TripInvitation invitation, Trip trip, TripMember inviter) {
	}

}
