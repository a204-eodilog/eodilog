package com.eodilog.weather.alternative;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.UUID;

@Schema(description = "날씨 대안 요청")
public record WeatherAlternativeRequest(
		@Schema(description = "대안을 볼 날짜(한국 시각). 여행 기간 안", example = "2026-11-14",
				requiredMode = Schema.RequiredMode.REQUIRED)
		LocalDate date,
		@Schema(description = "그 날짜 코스에 있는 대상 장소 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e71",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID placeId,
		@Schema(description = "GET /itinerary의 version", example = "3", requiredMode = Schema.RequiredMode.REQUIRED)
		Long expectedVersion) {
}
