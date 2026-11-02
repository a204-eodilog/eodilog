package com.eodilog.expense.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

// balance = 결제 - 올림 부담(+ 차액 수령자면 전체 차액). 양수는 받을 돈, 음수는 낼 돈
public record SettlementMemberResponse(
		@Schema(description = "멤버십 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e7f",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID memberId,

		@Schema(description = "결제 합계(원)", example = "30003", requiredMode = Schema.RequiredMode.REQUIRED)
		long paidMinor,

		@Schema(description = "원금 부담 합계(원). 올림 전", example = "10002", requiredMode = Schema.RequiredMode.REQUIRED)
		long baseOwedMinor,

		@Schema(description = "1인 부담액(원). 원금 부담 합계를 10원 단위로 한 번 올린 값", example = "10010",
				requiredMode = Schema.RequiredMode.REQUIRED)
		long owedMinor,

		@Schema(description = "이 멤버의 올림액(owedMinor - baseOwedMinor)", example = "8",
				requiredMode = Schema.RequiredMode.REQUIRED)
		long roundingAdjustmentMinor,

		@Schema(description = "잔액(원). 양수는 받을 돈, 음수는 낼 돈. 모든 멤버 합은 0", example = "-10010",
				requiredMode = Schema.RequiredMode.REQUIRED)
		long balanceMinor
) {
}
