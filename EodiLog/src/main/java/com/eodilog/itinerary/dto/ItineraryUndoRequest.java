package com.eodilog.itinerary.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

// 명세 §6 POST /trips/{tripId}/itinerary/undo 본문. 직전 AI 적용 한 번만 되돌린다
public record ItineraryUndoRequest(
		@Schema(description = "조회한 코스의 version(AI 적용 직후 version). 다르면 409", example = "4",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Long expectedVersion,

		@Schema(description = "되돌릴 AI 제안의 작업 ID(적용한 jobId)", example = "019a0000-0000-7000-8000-000000000001",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID appliedJobId
) {
}
