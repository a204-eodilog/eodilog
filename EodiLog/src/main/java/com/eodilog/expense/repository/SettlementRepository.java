package com.eodilog.expense.repository;

import com.eodilog.expense.domain.Settlement;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SettlementRepository extends JpaRepository<Settlement, UUID> {

	// 다른 여행의 계산은 없는 것으로 본다
	Optional<Settlement> findByIdAndTripId(UUID id, UUID tripId);

}
