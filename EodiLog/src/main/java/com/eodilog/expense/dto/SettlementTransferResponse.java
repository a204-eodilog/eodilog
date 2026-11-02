package com.eodilog.expense.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

// 송금 제안. 금액을 다시 10원 단위로 올리지 않는다
public record SettlementTransferResponse(
		@Schema(description = "송금 제안 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6ea0",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "보내는 멤버십 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e81",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID fromMemberId,

		@Schema(description = "받는 멤버십 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e7f",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID toMemberId,

		@Schema(description = "보낼 금액(원)", example = "10010", requiredMode = Schema.RequiredMode.REQUIRED)
		long amountMinor
) {
}
