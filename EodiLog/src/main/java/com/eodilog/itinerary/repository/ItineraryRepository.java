package com.eodilog.itinerary.repository;

import com.eodilog.itinerary.domain.Itinerary;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ItineraryRepository extends JpaRepository<Itinerary, UUID> {

	Optional<Itinerary> findByTripId(UUID tripId);

	// 전체 교체는 여행 행을 잠근 뒤 이 잠금으로 version을 비교한다(C-7)
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select i from Itinerary i where i.tripId = :tripId")
	Optional<Itinerary> findByTripIdForUpdate(@Param("tripId") UUID tripId);

}
