package com.eodilog.poll.repository;

import com.eodilog.poll.domain.Poll;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PollRepository extends JpaRepository<Poll, UUID> {

	// 다른 여행의 투표는 없는 투표와 같게 404로 응답한다
	Optional<Poll> findByIdAndTripId(UUID id, UUID tripId);

	// 내 선택·후보 추가는 여행 행을 잠근 뒤 이 잠금으로 마감·버전을 확인한다(V-3)
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select p from Poll p where p.id = :id and p.tripId = :tripId")
	Optional<Poll> findByIdAndTripIdForUpdate(@Param("id") UUID id, @Param("tripId") UUID tripId);

}
