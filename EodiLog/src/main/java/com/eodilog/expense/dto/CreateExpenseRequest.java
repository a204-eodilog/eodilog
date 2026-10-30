package com.eodilog.expense.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

// 명세 §10 ExpenseWrite. 등록자는 요청자로 서버가 정하므로 받지 않는다. 검증은 ExpenseService가 한다
public record CreateExpenseRequest(
		@Schema(description = "경비 이름. 앞뒤 공백 제거 후 1~200자", example = "흑돼지 저녁",
				requiredMode = Schema.RequiredMode.REQUIRED)
		String title,

		@Schema(description = "메모", example = "2차는 따로 계산", nullable = true)
		String memo,

		@Schema(description = "원금(원). 양의 정수", example = "120000", requiredMode = Schema.RequiredMode.REQUIRED)
		Long amountMinor,

		@Schema(description = "통화. KRW만 허용", example = "KRW", requiredMode = Schema.RequiredMode.REQUIRED)
		String currency,

		@Schema(description = "실제로 돈을 낸 멤버십 ID. 등록자와 다를 수 있다",
				example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e7f", requiredMode = Schema.RequiredMode.REQUIRED)
		UUID payerMemberId,

		@Schema(description = "분담할 멤버십 ID 목록. 1명 이상, 중복 없이. 원금을 균등 분담한다",
				requiredMode = Schema.RequiredMode.REQUIRED)
		List<UUID> participantMemberIds,

		@Schema(description = "지출 시각(UTC)", example = "2026-11-01T11:30:00Z", requiredMode = Schema.RequiredMode.REQUIRED)
		Instant spentAt
) {
}
