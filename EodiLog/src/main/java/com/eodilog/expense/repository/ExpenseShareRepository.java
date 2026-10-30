package com.eodilog.expense.repository;

import com.eodilog.expense.domain.ExpenseShare;
import com.eodilog.expense.domain.ExpenseShareId;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExpenseShareRepository extends JpaRepository<ExpenseShare, ExpenseShareId> {

	List<ExpenseShare> findAllByExpenseId(UUID expenseId);

	List<ExpenseShare> findAllByExpenseIdIn(Collection<UUID> expenseIds);

}
