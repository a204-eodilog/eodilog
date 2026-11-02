package com.eodilog.expense.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

// 정산 계산 한 번의 결과. 만든 뒤에는 바꾸지 않는다. 경비가 바뀌면 새로 계산하고, 이 행은 이전 계산으로 남는다
@Entity
@Table(name = "settlements")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Settlement {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID tripId;

	private UUID calculatedByMemberId;

	// 계산할 때의 여행 expense_version. 지금 값과 다르면 stale이다
	private long expenseVersion;

	private String currency;

	private long totalAmountMinor;

	private String roundingPolicy;

	private long roundingAdjustmentMinor;

	// 계산에 쓴 경비(ID·버전·이름·원금·결제자·분담액). 응답의 includedExpenses를 그대로 담는다
	@JdbcTypeCode(SqlTypes.JSON)
	private String expenseSnapshotJson;

	private long version;

	private Instant calculatedAt;

	public static Settlement create(UUID tripId, UUID calculatedByMemberId, long expenseVersion, long totalAmountMinor,
			long roundingAdjustmentMinor, String expenseSnapshotJson, Instant now) {
		Settlement settlement = new Settlement();
		settlement.tripId = tripId;
		settlement.calculatedByMemberId = calculatedByMemberId;
		settlement.expenseVersion = expenseVersion;
		settlement.currency = Expense.CURRENCY_KRW;
		settlement.totalAmountMinor = totalAmountMinor;
		settlement.roundingPolicy = SettlementCalculator.ROUNDING_POLICY;
		settlement.roundingAdjustmentMinor = roundingAdjustmentMinor;
		settlement.expenseSnapshotJson = expenseSnapshotJson;
		settlement.version = 1;
		settlement.calculatedAt = now;
		return settlement;
	}

}
