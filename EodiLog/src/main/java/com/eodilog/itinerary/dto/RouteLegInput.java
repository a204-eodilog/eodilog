package com.eodilog.itinerary.dto;

import com.eodilog.itinerary.domain.TransportMode;
import io.swagger.v3.oas.annotations.media.Schema;

// 명세 §10 ItineraryWrite.legs 항목. 날짜·순서로 구간을 가리키면 서버가 저장된 항목 ID에 연결한다
public record RouteLegInput(
		@Schema(description = "여행 일차", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
		Integer day,

		@Schema(description = "출발 항목의 order", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
		Integer fromOrder,

		@Schema(description = "도착 항목의 order. fromOrder+1이어야 한다", example = "2",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Integer toOrder,

		@Schema(description = "이동 수단", example = "TRANSIT", requiredMode = Schema.RequiredMode.REQUIRED)
		TransportMode transportMode
) {
}
