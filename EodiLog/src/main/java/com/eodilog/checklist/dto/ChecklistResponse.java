package com.eodilog.checklist.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

// 명세 §6 GET /trips/{tripId}/checklist. 여행당 목록 하나라 페이지 없이 전부 반환한다
public record ChecklistResponse(
		@Schema(description = "준비물 목록(추가한 순)", requiredMode = Schema.RequiredMode.REQUIRED)
		List<ChecklistItemResponse> items
) {
}
