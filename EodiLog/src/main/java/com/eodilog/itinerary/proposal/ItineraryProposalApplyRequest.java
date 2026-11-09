package com.eodilog.itinerary.proposal;

import io.swagger.v3.oas.annotations.media.Schema;

// 명세 §6 POST /trips/{tripId}/itinerary/proposals/{jobId}/apply 본문
public record ItineraryProposalApplyRequest(
		@Schema(description = "조회한 코스 version. 현재 코스와 제안의 baseVersion이 모두 이 값이어야 적용된다", example = "3",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Long expectedVersion
) {
}
