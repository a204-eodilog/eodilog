package com.eodilog.itinerary.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

// 명세 §10 ItineraryWrite.items 항목. 기존 항목은 id를 함께 보내 유지하고, 새 항목은 id 없이 보내면 서버가 발급한다
public record ItineraryItemInput(
		@Schema(description = "기존 항목 ID. 새 항목이면 생략. 이 코스의 항목이 아니면 400",
				example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e50", nullable = true)
		UUID id,

		@Schema(description = "장소 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e20",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID placeId,

		@Schema(description = "여행 일차(1부터). 여행 기간이 정해져 있으면 일수 이하", example = "1",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Integer day,

		@Schema(description = "그 날짜 안의 순서(1부터 빈틈없이)", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
		Integer order,

		@Schema(description = "도착·시작 시각 HH:mm(현지). 생략하면 비움", example = "10:30", nullable = true)
		String startTime,

		@Schema(description = "머무는 시간(분, 1~1440). 생략하면 비움", example = "90", nullable = true)
		Integer stayMinutes
) {
}
