package com.eodilog.trip.repository;

import com.eodilog.trip.domain.Trip;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TripRepository extends JpaRepository<Trip, UUID> {

	Optional<Trip> findByIdAndDeletedAtIsNull(UUID id);

	// 수정·이탈·방장 양도처럼 여행 행을 바꾸는 작업은 이 잠금으로 순서를 정한다(ERD 불변식 2)
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select t from Trip t where t.id = :id and t.deletedAt is null")
	Optional<Trip> findActiveByIdForUpdate(@Param("id") UUID id);

}
