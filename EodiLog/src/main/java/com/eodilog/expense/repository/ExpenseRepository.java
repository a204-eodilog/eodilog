package com.eodilog.expense.repository;

import com.eodilog.expense.domain.Expense;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExpenseRepository extends JpaRepository<Expense, UUID> {

	// 다른 여행의 경비·삭제된 경비는 없는 것으로 본다
	Optional<Expense> findByIdAndTripIdAndDeletedAtIsNull(UUID id, UUID tripId);

	// 정산 스냅샷용. 등록 순으로 고정해 같은 경비면 항상 같은 스냅샷이 된다
	List<Expense> findAllByTripIdAndDeletedAtIsNullOrderByCreatedAtAscIdAsc(UUID tripId);

}
