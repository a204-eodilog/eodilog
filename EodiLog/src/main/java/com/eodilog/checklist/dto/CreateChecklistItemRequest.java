package com.eodilog.checklist.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

// 명세 §6 POST /trips/{tripId}/checklist
public record CreateChecklistItemRequest(
		@Schema(description = "준비물 이름. 앞뒤 공백 제거 후 1~255자", example = "보조배터리",
				requiredMode = Schema.RequiredMode.REQUIRED)
		String label,

		@Schema(description = "채택할 AI 준비물 제안 작업 ID. suggestionIndex와 함께 보낸다. AI 제안 기능 연동 전에는 보낼 수 없다")
		UUID sourceJobId,

		@Schema(description = "제안 결과 items의 순번(0부터). sourceJobId와 함께 보낸다", example = "0")
		Integer suggestionIndex
) {
}
