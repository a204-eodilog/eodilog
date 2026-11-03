package com.eodilog.itinerary.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

// 명세 §10 ItineraryItem
public record ItineraryItemResponse(
		@Schema(description = "항목 ID. 다음 교체 요청에서 그대로 보내면 유지된다", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e50",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "장소", requiredMode = Schema.RequiredMode.REQUIRED)
		ItineraryPlaceResponse place,

		@Schema(description = "여행 일차(1부터)", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
		int day,

		@Schema(description = "그 날짜 안의 순서(1부터)", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
		int order,

		@Schema(description = "도착·시작 시각 HH:mm(현지). 없으면 null", example = "10:30",
				requiredMode = Schema.RequiredMode.REQUIRED, nullable = true)
		String startTime,

		@Schema(description = "머무는 시간(분). 없으면 null", example = "90", requiredMode = Schema.RequiredMode.REQUIRED,
				nullable = true)
		Integer stayMinutes
) {
}
