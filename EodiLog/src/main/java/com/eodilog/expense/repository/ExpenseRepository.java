package com.eodilog.expense.repository;

import com.eodilog.expense.domain.Expense;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExpenseRepository extends JpaRepository<Expense, UUID> {

	// 다른 여행의 경비·삭제된 경비는 없는 것으로 본다
	Optional<Expense> findByIdAndTripIdAndDeletedAtIsNull(UUID id, UUID tripId);

}
