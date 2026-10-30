package com.eodilog.expense.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 분담자별 원금 분담액. 분담자를 바꾸거나 금액을 바꾸면 기존 행을 지우고 다시 넣는다
@Entity
@Table(name = "expense_shares")
@IdClass(ExpenseShareId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ExpenseShare {

	@Id
	private UUID expenseId;

	@Id
	private UUID memberId;

	private long amountMinor;

	public static ExpenseShare of(UUID expenseId, UUID memberId, long amountMinor) {
		ExpenseShare share = new ExpenseShare();
		share.expenseId = expenseId;
		share.memberId = memberId;
		share.amountMinor = amountMinor;
		return share;
	}

}
