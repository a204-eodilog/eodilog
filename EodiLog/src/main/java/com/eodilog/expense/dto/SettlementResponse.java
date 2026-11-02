package com.eodilog.expense.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

// 명세 §10 Settlement. 멤버는 참여 순, 송금 제안은 금액이 큰 순이다
public record SettlementResponse(
		@Schema(description = "정산 계산 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6eb0",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "여행 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID tripId,

		@Schema(description = "통화. KRW 고정", example = "KRW", requiredMode = Schema.RequiredMode.REQUIRED)
		String currency,

		@Schema(description = "계산 기준 비용 버전", example = "3", requiredMode = Schema.RequiredMode.REQUIRED)
		long expenseVersion,

		@Schema(description = "계산 결과 version. 계산 결과는 바뀌지 않아 항상 1", example = "1",
				requiredMode = Schema.RequiredMode.REQUIRED)
		long version,

		@Schema(description = "오래된 계산인지. 이후 경비가 바뀌었거나 더 새 계산이 있으면 true", example = "false",
				requiredMode = Schema.RequiredMode.REQUIRED)
		boolean stale,

		@Schema(description = "포함된 경비 원금 합계(원)", example = "30003", requiredMode = Schema.RequiredMode.REQUIRED)
		long totalAmountMinor,

		@Schema(description = "계산에 포함된 경비(계산 당시 값)", requiredMode = Schema.RequiredMode.REQUIRED)
		List<IncludedExpenseResponse> includedExpenses,

		@Schema(description = "경비에 결제자·분담자로 나온 멤버별 결과(이탈 멤버 포함, 참여 순)",
				requiredMode = Schema.RequiredMode.REQUIRED)
		List<SettlementMemberResponse> members,

		@Schema(description = "송금 제안", requiredMode = Schema.RequiredMode.REQUIRED)
		List<SettlementTransferResponse> transfers,

		@Schema(description = "올림 규칙 식별자. 여행 합산 후 1회 10원 올림, 차액은 원금 기준 받을 돈이 가장 많은 사람",
				example = "TRIP_TOTAL_CEIL_10_TO_TOP_CREDITOR", requiredMode = Schema.RequiredMode.REQUIRED)
		String roundingPolicy,

		@Schema(description = "올림으로 생긴 전체 차액(원)", example = "17", requiredMode = Schema.RequiredMode.REQUIRED)
		long roundingAdjustmentMinor,

		@Schema(description = "계산 시각(UTC)", example = "2026-11-02T01:30:00Z", requiredMode = Schema.RequiredMode.REQUIRED)
		Instant calculatedAt
) {
}
