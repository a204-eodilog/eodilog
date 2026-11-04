package com.eodilog.visit.repository;

import com.eodilog.visit.domain.Visit;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VisitRepository extends JpaRepository<Visit, UUID> {

	// 여행·멤버·장소당 지우지 않은 방문은 하나다(정책 §16 VS-1)
	Optional<Visit> findByTripIdAndMemberIdAndPlaceIdAndDeletedAtIsNull(UUID tripId, UUID memberId, UUID placeId);

	// 다른 여행 경로로 방문을 지울 수 없게 trip_id까지 함께 찾는다
	Optional<Visit> findByIdAndTripIdAndDeletedAtIsNull(UUID id, UUID tripId);

}
