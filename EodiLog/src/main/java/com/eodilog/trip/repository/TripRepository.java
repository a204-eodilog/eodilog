package com.eodilog.trip.repository;

import com.eodilog.trip.domain.Trip;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TripRepository extends JpaRepository<Trip, UUID> {
}
