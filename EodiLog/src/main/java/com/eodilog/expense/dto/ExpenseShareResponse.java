package com.eodilog.expense.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

public record ExpenseShareResponse(
		@Schema(description = "분담자 멤버십 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e7f",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID memberId,

		@Schema(description = "원금 분담액(원). 정산 10원 올림 전 금액", example = "40000",
				requiredMode = Schema.RequiredMode.REQUIRED)
		long amountMinor
) {
}
