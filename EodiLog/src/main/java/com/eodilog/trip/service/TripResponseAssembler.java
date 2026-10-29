package com.eodilog.trip.service;

import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.domain.TripDestination;
import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.domain.TripMemberStatus;
import com.eodilog.trip.domain.TripStatus;
import com.eodilog.trip.domain.TripStatusPolicy;
import com.eodilog.trip.dto.TripMemberResponse;
import com.eodilog.trip.dto.TripResponse;
import com.eodilog.trip.repository.TripDestinationRepository;
import com.eodilog.trip.repository.TripMemberRepository;
import com.eodilog.user.dto.UserCard;
import com.eodilog.user.service.UserCardReader;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

// 여행 응답(명세 §10 Trip)을 만든다. 여러 여행도 여행지·멤버·회원 정보를 각각 한 번씩만 조회한다
// 상태는 저장된 값이 아니라 조회 시점의 날짜로 계산한다(날짜가 지나도 저장 값은 바뀌지 않으므로)
@Component
@RequiredArgsConstructor
public class TripResponseAssembler {

	private final TripDestinationRepository tripDestinationRepository;
	private final TripMemberRepository tripMemberRepository;
	private final UserCardReader userCardReader;
	private final Clock clock;

	@Transactional(readOnly = true)
	public TripResponse assemble(UUID viewerId, Trip trip) {
		return assemble(viewerId, List.of(trip)).getFirst();
	}

	@Transactional(readOnly = true)
	public List<TripResponse> assemble(UUID viewerId, List<Trip> trips) {
		if (trips.isEmpty()) {
			return List.of();
		}
		List<UUID> tripIds = trips.stream().map(Trip::getId).toList();

		Map<UUID, List<UUID>> destinationsByTrip = new LinkedHashMap<>();
		for (TripDestination destination : tripDestinationRepository.findAllByTripIdInOrderByDisplayOrder(tripIds)) {
			destinationsByTrip.computeIfAbsent(destination.getTripId(), id -> new ArrayList<>())
					.add(destination.getRegionId());
		}

		Map<UUID, List<TripMember>> membersByTrip = new LinkedHashMap<>();
		Set<UUID> userIds = new LinkedHashSet<>();
		for (TripMember member : tripMemberRepository.findAllByTripIdInAndStatusOrderByJoinOrder(tripIds,
				TripMemberStatus.ACTIVE)) {
			membersByTrip.computeIfAbsent(member.getTripId(), id -> new ArrayList<>()).add(member);
			userIds.add(member.getUserId());
		}
		Map<UUID, UserCard> cards = userCardReader.findCards(viewerId, userIds);

		LocalDate today = TripStatusPolicy.today(clock);
		return trips.stream()
				.map(trip -> toResponse(trip, today, destinationsByTrip.getOrDefault(trip.getId(), List.of()),
						membersByTrip.getOrDefault(trip.getId(), List.of()), cards))
				.toList();
	}

	private TripResponse toResponse(Trip trip, LocalDate today, List<UUID> destinationRegionIds,
			List<TripMember> members, Map<UUID, UserCard> cards) {
		UUID ownerMemberId = null;
		List<TripMemberResponse> memberResponses = new ArrayList<>();
		for (TripMember member : members) {
			UserCard card = cards.get(member.getUserId());
			if (card == null) {
				throw new IllegalStateException("Trip member has no user record: " + member.getId());
			}
			if (member.getUserId().equals(trip.getOwnerUserId())) {
				ownerMemberId = member.getId();
			}
			memberResponses.add(TripMemberResponse.of(member, card, trip.getOwnerUserId()));
		}
		// 방장은 같은 여행의 ACTIVE 멤버여야 한다(ERD 불변식). 어긋나면 자료 오류다
		if (ownerMemberId == null) {
			throw new IllegalStateException("Trip owner is not an active member: " + trip.getId());
		}
		TripStatus status = TripStatusPolicy.resolve(trip.getStartDate(), trip.getEndDate(), today);
		return TripResponse.of(trip, status, destinationRegionIds, ownerMemberId, memberResponses);
	}

}
