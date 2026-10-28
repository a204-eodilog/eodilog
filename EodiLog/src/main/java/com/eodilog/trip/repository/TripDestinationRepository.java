package com.eodilog.trip.repository;

import com.eodilog.trip.domain.TripDestination;
import com.eodilog.trip.domain.TripDestinationId;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TripDestinationRepository extends JpaRepository<TripDestination, TripDestinationId> {

	List<TripDestination> findAllByTripIdOrderByDisplayOrder(UUID tripId);

}
