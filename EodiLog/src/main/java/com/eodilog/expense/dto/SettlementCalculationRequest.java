package com.eodilog.expense.dto;

import io.swagger.v3.oas.annotations.media.Schema;

// 명세 §7 POST /settlements 요청. 지금 여행의 비용 버전과 다르면 다른 경비 변경이 있었으므로 409
public record SettlementCalculationRequest(
		@Schema(description = "계산 기준으로 삼을 비용 버전", example = "3", requiredMode = Schema.RequiredMode.REQUIRED)
		Long expectedExpenseVersion
) {
}
