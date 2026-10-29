package com.eodilog.trip.service;

import com.eodilog.global.common.response.PageResponse;
import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.domain.TripMemberStatus;
import com.eodilog.trip.domain.TripStatus;
import com.eodilog.trip.domain.TripStatusPolicy;
import com.eodilog.trip.dto.TripResponse;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TripQueryService {

	public static final int DEFAULT_LIMIT = 20;
	public static final int MAX_LIMIT = 100;

	private final TripAccessChecker tripAccessChecker;
	private final TripResponseAssembler tripResponseAssembler;
	private final EntityManager entityManager;
	private final Clock clock;

	public TripResponse getTrip(UUID userId, UUID tripId) {
		Trip trip = tripAccessChecker.requireActiveMember(tripId, userId).trip();
		return tripResponseAssembler.assemble(userId, trip);
	}

	// 내가 ACTIVE 멤버인 삭제되지 않은 여행. 상태 필터는 저장 값이 아니라 오늘 날짜와 기간으로 거른다
	public PageResponse<TripResponse> getMyTrips(UUID userId, TripStatus status, String cursor, int limit) {
		TripCursor after = cursor == null || cursor.isBlank() ? null : TripCursor.decode(cursor);

		StringBuilder jpql = new StringBuilder("""
				select t from Trip t
				where t.deletedAt is null
				and exists (select 1 from TripMember m
					where m.tripId = t.id and m.userId = :userId and m.status = :activeStatus)
				""");
		if (status != null) {
			jpql.append(switch (status) {
				case PLANNING -> " and (t.startDate is null or t.startDate > :today)";
				case ONGOING -> " and t.startDate <= :today and t.endDate >= :today";
				case COMPLETED -> " and t.endDate < :today";
			});
		}
		if (after != null) {
			jpql.append(" and (t.createdAt < :cursorCreatedAt or (t.createdAt = :cursorCreatedAt and t.id < :cursorId))");
		}
		jpql.append(" order by t.createdAt desc, t.id desc");

		TypedQuery<Trip> query = entityManager.createQuery(jpql.toString(), Trip.class)
				.setParameter("userId", userId)
				.setParameter("activeStatus", TripMemberStatus.ACTIVE)
				.setMaxResults(limit + 1);
		if (status != null) {
			query.setParameter("today", TripStatusPolicy.today(clock));
		}
		if (after != null) {
			query.setParameter("cursorCreatedAt", after.createdAt()).setParameter("cursorId", after.id());
		}
		List<Trip> found = query.getResultList();

		boolean hasNext = found.size() > limit;
		List<Trip> page = hasNext ? found.subList(0, limit) : found;
		String nextCursor = hasNext ? new TripCursor(page.getLast().getCreatedAt(), page.getLast().getId()).encode() : null;
		return PageResponse.of(tripResponseAssembler.assemble(userId, page), nextCursor, hasNext);
	}

}
