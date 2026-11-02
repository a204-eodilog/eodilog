package com.eodilog.expense.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

// 송금 제안 한 건. 완료·은행 상태는 없다
@Entity
@Table(name = "settlement_transfers")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SettlementTransfer {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID settlementId;

	private UUID fromMemberId;

	private UUID toMemberId;

	private long amountMinor;

	// 계산할 때 정한 표시 순서(1부터)
	private int displayOrder;

	public static SettlementTransfer of(UUID settlementId, SettlementCalculator.TransferResult result,
			int displayOrder) {
		SettlementTransfer transfer = new SettlementTransfer();
		transfer.settlementId = settlementId;
		transfer.fromMemberId = result.fromMemberId();
		transfer.toMemberId = result.toMemberId();
		transfer.amountMinor = result.amountMinor();
		transfer.displayOrder = displayOrder;
		return transfer;
	}

}
