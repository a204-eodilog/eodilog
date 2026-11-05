package com.eodilog.trip.repository;

import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.domain.TripMemberStatus;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TripMemberRepository extends JpaRepository<TripMember, UUID> {

	Optional<TripMember> findByTripIdAndUserId(UUID tripId, UUID userId);

	long countByTripIdAndStatus(UUID tripId, TripMemberStatus status);

	// 나간 멤버의 순번도 포함한다. 새 참여·재참여는 여행 행 잠금 아래에서 이 값 + 1을 받는다
	@Query("select coalesce(max(m.joinOrder), 0) from TripMember m where m.tripId = :tripId")
	long findMaxJoinOrder(@Param("tripId") UUID tripId);

	List<TripMember> findAllByTripIdInAndStatusOrderByJoinOrder(Collection<UUID> tripIds, TripMemberStatus status);

	List<TripMember> findAllByTripIdOrderByJoinOrder(UUID tripId);

	// 알림 수신자 후보. 지금 ACTIVE인 멤버의 회원 ID다
	@Query("select m.userId from TripMember m where m.tripId = :tripId"
			+ " and m.status = com.eodilog.trip.domain.TripMemberStatus.ACTIVE order by m.joinOrder")
	List<UUID> findActiveUserIds(@Param("tripId") UUID tripId);

}
