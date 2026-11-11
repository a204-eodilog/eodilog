package com.eodilog.itinerary.route;

import io.swagger.v3.oas.annotations.media.Schema;

// POST /trips/{tripId}/itinerary/routes/recalculate 본문(명세 §6). 표에 없는 필드는 공통 설정이 400으로 막는다
public record RouteRecalculationRequest(
		@Schema(description = "GET /itinerary에서 받은 코스 version", example = "3",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Long expectedVersion
) {
}
