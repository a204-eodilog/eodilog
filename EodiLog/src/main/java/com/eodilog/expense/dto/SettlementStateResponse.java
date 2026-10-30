package com.eodilog.expense.dto;

import io.swagger.v3.oas.annotations.media.Schema;

// 명세 §10 SettlementState. 정산 계산(Q-10)이 열리기 전에는 current가 항상 null이다
public record SettlementStateResponse(
		@Schema(description = "현재 정산 계산 결과. 아직 계산한 적이 없으면 null(정산 방식 Q-10 합의 전에는 항상 null)",
				requiredMode = Schema.RequiredMode.REQUIRED, nullable = true)
		Object current,

		@Schema(description = "현재 비용 버전. 경비 등록·수정·삭제마다 1씩 오른다", example = "3",
				requiredMode = Schema.RequiredMode.REQUIRED)
		long currentExpenseVersion,

		@Schema(description = "현재 계산 이후 경비가 바뀌어 다시 계산해야 하는지. 계산 결과가 없으면 false", example = "false",
				requiredMode = Schema.RequiredMode.REQUIRED)
		boolean recalculationRequired
) {
}
