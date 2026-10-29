package com.eodilog.trip.repository;

import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.domain.TripMemberStatus;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TripMemberRepository extends JpaRepository<TripMember, UUID> {

	Optional<TripMember> findByTripIdAndUserId(UUID tripId, UUID userId);

	List<TripMember> findAllByTripIdInAndStatusOrderByJoinOrder(Collection<UUID> tripIds, TripMemberStatus status);

}
