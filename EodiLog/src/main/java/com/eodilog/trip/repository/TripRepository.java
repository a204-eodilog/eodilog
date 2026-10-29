package com.eodilog.trip.repository;

import com.eodilog.trip.domain.Trip;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TripRepository extends JpaRepository<Trip, UUID> {

	Optional<Trip> findByIdAndDeletedAtIsNull(UUID id);

}
