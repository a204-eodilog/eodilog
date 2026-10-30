package com.eodilog.expense.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

// 등록자만 수정·삭제한다. 분담액(ExpenseShare)·trips.expense_version과 같은 트랜잭션에서 바꾼다(ERD 불변식 5)
@Entity
@Table(name = "expenses")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Expense {

	public static final String CURRENCY_KRW = "KRW";

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID tripId;

	private UUID registeredByMemberId;

	private UUID payerMemberId;

	private String title;

	private String memo;

	private long amountMinor;

	private String currency;

	private Instant spentAt;

	private long version;

	private Instant createdAt;

	private Instant updatedAt;

	private Instant deletedAt;

	public static Expense create(UUID tripId, UUID registeredByMemberId, UUID payerMemberId, String title, String memo,
			long amountMinor, Instant spentAt, Instant now) {
		Expense expense = new Expense();
		expense.tripId = tripId;
		expense.registeredByMemberId = registeredByMemberId;
		expense.payerMemberId = payerMemberId;
		expense.title = title;
		expense.memo = memo;
		expense.amountMinor = amountMinor;
		expense.currency = CURRENCY_KRW;
		expense.spentAt = spentAt;
		expense.version = 1;
		expense.createdAt = now;
		expense.updatedAt = now;
		return expense;
	}

	// 바뀐 값이 있을 때만 호출한다. 경비 version을 하나 올린다
	public void update(UUID payerMemberId, String title, String memo, long amountMinor, Instant spentAt, Instant now) {
		this.payerMemberId = payerMemberId;
		this.title = title;
		this.memo = memo;
		this.amountMinor = amountMinor;
		this.spentAt = spentAt;
		this.version++;
		this.updatedAt = now;
	}

	public void delete(Instant now) {
		this.deletedAt = now;
		this.updatedAt = now;
	}

	public boolean isRegisteredBy(UUID memberId) {
		return registeredByMemberId.equals(memberId);
	}

}
