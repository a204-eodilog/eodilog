package com.eodilog.expense.dto;

import io.swagger.v3.oas.annotations.media.Schema;

// 명세 §7 POST /settlements 요청. 정산 방식(Q-10) 합의 전에는 받기만 하고 계산하지 않는다
public record SettlementCalculationRequest(
		@Schema(description = "계산 기준으로 삼을 비용 버전", example = "3", requiredMode = Schema.RequiredMode.REQUIRED)
		Long expectedExpenseVersion
) {
}
