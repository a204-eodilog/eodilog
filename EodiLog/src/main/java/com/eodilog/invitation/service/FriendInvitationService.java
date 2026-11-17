package com.eodilog.invitation.service;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.invitation.domain.TripFriendInvitation;
import com.eodilog.invitation.domain.TripFriendInvitationStatus;
import com.eodilog.invitation.dto.InvitableFriendsResponse;
import com.eodilog.invitation.dto.InvitableFriendsResponse.InvitableFriend;
import com.eodilog.invitation.dto.InvitableFriendsResponse.State;
import com.eodilog.invitation.dto.ReceivedTripInvitationResponse;
import com.eodilog.invitation.dto.ReceivedTripInvitationResponse.Status;
import com.eodilog.invitation.dto.ReceivedTripInvitationResponse.TripBrief;
import com.eodilog.invitation.dto.SendFriendInvitationsResponse;
import com.eodilog.invitation.dto.SendFriendInvitationsResponse.Outcome;
import com.eodilog.invitation.dto.SendFriendInvitationsResponse.Result;
import com.eodilog.invitation.exception.InvitationErrorCode;
import com.eodilog.invitation.repository.TripFriendInvitationRepository;
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
import com.eodilog.user.follow.MutualFollowReader;
import com.eodilog.user.service.UserCardReader;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 맞팔 친구에게 앱 안에서 여행 초대를 보내고, 받은 사람이 수락·거절한다(docs/plan/in-app-trip-invite-backend-2026-11-17.md).
// 링크 초대와 따로 동작한다. 맞팔은 보낼 때만 확인하고, 수락은 링크 수락과 같은 참여 처리(TripJoiner)를 쓴다
@Service
@RequiredArgsConstructor
public class FriendInvitationService {

	// 한 번에 보낼 수 있는 사람 수. 방장 한 명을 뺀 정원이다
	static final int MAX_INVITEES = TripJoiner.MAX_ACTIVE_MEMBERS - 1;
	// 초대 후보 목록에 담는 최대 맞팔 수. 넘으면 truncated=true
	static final int MAX_FRIENDS = 500;

	private final TripFriendInvitationRepository invitationRepository;
	private final TripRepository tripRepository;
	private final TripMemberRepository tripMemberRepository;
	private final TripAccessChecker tripAccessChecker;
	private final TripResponseAssembler tripResponseAssembler;
	private final TripJoiner tripJoiner;
	private final MutualFollowReader mutualFollowReader;
	private final UserCardReader userCardReader;
	private final FriendInvitationNotifier notifier;
	private final Clock clock;

	// 여행 ACTIVE 멤버만 본다. 초대한 사람이 나간 초대·기간이 지난 초대는 INVITED로 보지 않는다
	@Transactional(readOnly = true)
	public InvitableFriendsResponse invitableFriends(UUID me, UUID tripId) {
		tripAccessChecker.requireActiveMember(tripId, me);
		List<UUID> mutual = mutualFollowReader.mutualIds(me, MAX_FRIENDS + 1);
		boolean truncated = mutual.size() > MAX_FRIENDS;
		if (truncated) mutual = mutual.subList(0, MAX_FRIENDS);

		Set<UUID> members = new HashSet<>(tripMemberRepository.findActiveUserIds(tripId));
		Map<UUID, UUID> pending = invitationRepository.findUsablePendingByTrip(tripId, now()).stream()
				.collect(Collectors.toMap(TripFriendInvitation::getInviteeUserId, TripFriendInvitation::getId,
						(a, b) -> a));
		Map<UUID, UserCard> cards = userCardReader.findCards(me, mutual);

		List<InvitableFriend> friends = new ArrayList<>(mutual.size());
		for (UUID id : mutual) {
			UserCard card = cards.get(id);
			if (card == null) continue;
			if (members.contains(id)) friends.add(new InvitableFriend(card, State.MEMBER, null));
			else if (pending.containsKey(id)) friends.add(new InvitableFriend(card, State.INVITED, pending.get(id)));
			else friends.add(new InvitableFriend(card, State.INVITABLE, null));
		}
		// mutualIds가 닉네임 순이므로 안정 정렬로 묶음 순서만 바꾼다
		friends.sort(Comparator.comparing(InvitableFriend::state));
		return new InvitableFriendsResponse(friends, members.size(), TripJoiner.MAX_ACTIVE_MEMBERS, truncated);
	}

	// 여행 행을 잠가 같은 여행의 보내기·수락·취소를 한 줄로 세운다. 받는 사람마다 결과를 따로 정한다
	@Transactional
	public SendFriendInvitationsResponse send(UUID me, UUID tripId, List<UUID> inviteeUserIds) {
		List<UUID> invitees = validateInvitees(me, inviteeUserIds);
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, me);
		tripJoiner.requireSeat(tripId);
		Instant now = now();
		List<Result> results = new ArrayList<>(invitees.size());
		for (UUID invitee : invitees) {
			results.add(sendOne(access, invitee, now));
		}
		return new SendFriendInvitationsResponse(results);
	}

	private Result sendOne(TripAccess access, UUID invitee, Instant now) {
		UUID tripId = access.trip().getId();
		// 없는 회원과 맞팔이 아닌 회원은 구분하지 않는다(회원 존재 여부를 드러내지 않음)
		if (!mutualFollowReader.isMutual(access.member().getUserId(), invitee)) {
			return new Result(invitee, Outcome.NOT_MUTUAL, null);
		}
		if (tripMemberRepository.findByTripIdAndUserId(tripId, invitee).filter(TripMember::isActive).isPresent()) {
			return new Result(invitee, Outcome.ALREADY_MEMBER, null);
		}
		Optional<TripFriendInvitation> existing = invitationRepository.findPending(tripId, invitee);
		if (existing.isPresent()) {
			TripFriendInvitation pending = existing.get();
			if (!pending.isExpiredAt(now) && inviterActive(pending)) {
				return new Result(invitee, Outcome.ALREADY_INVITED, pending.getId());
			}
			// 쓸 수 없게 된 대기 초대는 정리한 뒤 새로 보낸다. 대기 초대는 여행·사람마다 하나(부분 유니크 인덱스)라 먼저 반영한다
			pending.cancel(now);
			invitationRepository.flush();
		}
		TripFriendInvitation created = invitationRepository.save(TripFriendInvitation.create(tripId,
				access.member().getId(), invitee, now.plus(InvitationService.EXPIRES_AFTER), now));
		invitationRepository.flush();
		notifier.invited(created, access.member().getUserId(), access.trip());
		return new Result(invitee, Outcome.SENT, created.getId());
	}

	// 여행 ACTIVE 멤버 누구나 취소한다. 대기 중이 아니거나 없으면 바뀌는 것 없이 성공한다(링크 취소와 같은 멱등)
	@Transactional
	public void cancel(UUID me, UUID tripId, UUID invitationId) {
		tripAccessChecker.requireActiveMemberForUpdate(tripId, me);
		invitationRepository.findByIdAndTripIdForUpdate(invitationId, tripId).ifPresent(i -> i.cancel(now()));
	}

	@Transactional(readOnly = true)
	public List<ReceivedTripInvitationResponse> received(UUID me) {
		Instant now = now();
		List<TripFriendInvitation> invitations = invitationRepository.findUsablePendingByInvitee(me, now);
		if (invitations.isEmpty()) return List.of();
		Map<UUID, Trip> trips = tripRepository.findAllById(invitations.stream().map(TripFriendInvitation::getTripId)
				.collect(Collectors.toSet())).stream().collect(Collectors.toMap(Trip::getId, Function.identity()));
		Map<UUID, TripMember> inviters = inviterMembers(invitations);
		Map<UUID, UserCard> cards = userCardReader.findCards(me,
				inviters.values().stream().map(TripMember::getUserId).collect(Collectors.toSet()));
		Map<UUID, Long> memberCounts = new HashMap<>();
		List<ReceivedTripInvitationResponse> result = new ArrayList<>(invitations.size());
		for (TripFriendInvitation invitation : invitations) {
			Trip trip = trips.get(invitation.getTripId());
			TripMember inviter = inviters.get(invitation.getInviterMemberId());
			UserCard card = inviter == null ? null : cards.get(inviter.getUserId());
			if (trip == null || card == null) continue;
			long memberCount = memberCounts.computeIfAbsent(trip.getId(), this::activeCount);
			result.add(toResponse(invitation, trip, card, Status.PENDING, false, memberCount));
		}
		return result;
	}

	// 받은 사람 본인만 본다. 쓸 수 없게 된 초대도 410 대신 상태로 알려 화면이 안내 문구를 고르게 한다
	@Transactional(readOnly = true)
	public ReceivedTripInvitationResponse get(UUID me, UUID invitationId) {
		TripFriendInvitation invitation = invitationRepository.findByIdAndInviteeUserId(invitationId, me)
				.orElseThrow(() -> new BusinessException(InvitationErrorCode.FRIEND_INVITATION_NOT_FOUND));
		Trip trip = tripRepository.findById(invitation.getTripId())
				.orElseThrow(() -> new BusinessException(InvitationErrorCode.FRIEND_INVITATION_NOT_FOUND));
		TripMember inviter = tripMemberRepository.findById(invitation.getInviterMemberId())
				.orElseThrow(() -> new IllegalStateException("Invitation has no inviter: " + invitationId));
		UserCard card = userCardReader.findCards(me, List.of(inviter.getUserId())).get(inviter.getUserId());
		if (card == null) {
			throw new IllegalStateException("Trip member has no user record: " + inviter.getId());
		}
		boolean deleted = trip.getDeletedAt() != null;
		boolean alreadyMember = !deleted && tripMemberRepository.findByTripIdAndUserId(trip.getId(), me)
				.filter(TripMember::isActive).isPresent();
		Status status = switch (invitation.getStatus()) {
			case PENDING -> deleted || invitation.isExpiredAt(now()) || !inviter.isActive()
					? Status.EXPIRED : Status.PENDING;
			case ACCEPTED -> Status.ACCEPTED;
			case DECLINED -> Status.DECLINED;
			case CANCELED -> Status.CANCELED;
		};
		return toResponse(invitation, trip, card, status, alreadyMember, deleted ? 0 : activeCount(trip.getId()));
	}

	// 없음·남의 초대 404 → 삭제된 여행 410 EXPIRED → 이미 ACTIVE면 그대로 반환 → 처리된 초대 410 REVOKED
	// → 기간 지남·초대한 사람 나감 410 EXPIRED → 정원 409 → 참여 순이다. 맞팔은 다시 확인하지 않는다
	@Transactional
	public TripResponse accept(UUID me, UUID invitationId) {
		UUID tripId = invitationRepository.findTripIdForInvitee(invitationId, me)
				.orElseThrow(() -> new BusinessException(InvitationErrorCode.FRIEND_INVITATION_NOT_FOUND));
		// 여행 행 → 초대 행 순으로 잠근다. 보내기·취소도 여행 행을 먼저 잠그므로 순서가 엇갈리지 않는다
		Trip trip = tripRepository.findActiveByIdForUpdate(tripId)
				.orElseThrow(() -> new BusinessException(InvitationErrorCode.INVITATION_EXPIRED));
		TripFriendInvitation invitation = invitationRepository.findForUpdate(invitationId, me)
				.orElseThrow(() -> new BusinessException(InvitationErrorCode.FRIEND_INVITATION_NOT_FOUND));
		Instant now = now();
		Optional<TripMember> existing = tripMemberRepository.findByTripIdAndUserId(tripId, me);
		if (existing.filter(TripMember::isActive).isPresent()) {
			invitation.accept(now);
			return tripResponseAssembler.assemble(me, trip);
		}
		if (invitation.getStatus() != TripFriendInvitationStatus.PENDING) {
			throw new BusinessException(InvitationErrorCode.INVITATION_REVOKED);
		}
		if (invitation.isExpiredAt(now) || !inviterActive(invitation)) {
			throw new BusinessException(InvitationErrorCode.INVITATION_EXPIRED);
		}
		tripJoiner.join(trip, me, existing, now);
		invitation.accept(now);
		return tripResponseAssembler.assemble(me, trip);
	}

	// 대기 중이면 거절한다. 이미 거절했으면 그대로 성공. 수락·취소된 초대와 없는 초대는 404. 보낸 사람에게 알리지 않는다
	@Transactional
	public void decline(UUID me, UUID invitationId) {
		TripFriendInvitation invitation = invitationRepository.findForUpdate(invitationId, me)
				.orElseThrow(() -> new BusinessException(InvitationErrorCode.FRIEND_INVITATION_NOT_FOUND));
		switch (invitation.getStatus()) {
			case PENDING -> invitation.decline(now());
			case DECLINED -> { }
			default -> throw new BusinessException(InvitationErrorCode.FRIEND_INVITATION_NOT_FOUND);
		}
	}

	private List<UUID> validateInvitees(UUID me, List<UUID> inviteeUserIds) {
		if (inviteeUserIds == null || inviteeUserIds.isEmpty() || inviteeUserIds.contains(null)) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
		}
		List<UUID> invitees = List.copyOf(new LinkedHashSet<>(inviteeUserIds));
		if (invitees.size() > MAX_INVITEES || invitees.contains(me)) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
		}
		return invitees;
	}

	private boolean inviterActive(TripFriendInvitation invitation) {
		return tripMemberRepository.findById(invitation.getInviterMemberId()).filter(TripMember::isActive).isPresent();
	}

	private Map<UUID, TripMember> inviterMembers(List<TripFriendInvitation> invitations) {
		return tripMemberRepository.findAllById(invitations.stream().map(TripFriendInvitation::getInviterMemberId)
				.collect(Collectors.toSet())).stream().collect(Collectors.toMap(TripMember::getId, Function.identity()));
	}

	private long activeCount(UUID tripId) {
		return tripMemberRepository.countByTripIdAndStatus(tripId, TripMemberStatus.ACTIVE);
	}

	private static ReceivedTripInvitationResponse toResponse(TripFriendInvitation invitation, Trip trip, UserCard inviter,
			Status status, boolean alreadyMember, long memberCount) {
		return new ReceivedTripInvitationResponse(invitation.getId(),
				new TripBrief(trip.getId(), trip.getTitle(), trip.getStartDate(), trip.getEndDate(), memberCount),
				inviter, status, alreadyMember, invitation.getExpiresAt(), invitation.getCreatedAt());
	}

	private Instant now() {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

}
