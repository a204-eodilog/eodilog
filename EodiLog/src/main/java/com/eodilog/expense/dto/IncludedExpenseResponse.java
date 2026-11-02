package com.eodilog.expense.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

// 정산에 포함된 경비의 계산 당시 값. 이후 경비가 바뀌거나 삭제돼도 이 값은 그대로다
public record IncludedExpenseResponse(
		@Schema(description = "경비 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e90",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID expenseId,

		@Schema(description = "계산 당시 경비 version", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
		long expenseVersion,

		@Schema(description = "경비 이름", example = "흑돼지 저녁", requiredMode = Schema.RequiredMode.REQUIRED)
		String title,

		@Schema(description = "원금(원)", example = "120000", requiredMode = Schema.RequiredMode.REQUIRED)
		long amountMinor,

		@Schema(description = "결제한 멤버십 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e7f",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID payerMemberId,

		@Schema(description = "분담자별 원금 분담액(참여 순)", requiredMode = Schema.RequiredMode.REQUIRED)
		List<ExpenseShareResponse> shares
) {
}
