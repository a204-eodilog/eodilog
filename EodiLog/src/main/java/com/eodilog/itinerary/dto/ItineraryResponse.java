package com.eodilog.itinerary.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

// 명세 §10 Itinerary. 여행당 하나뿐인 현재 코스. 확정·승인 단계는 없다
public record ItineraryResponse(
		@Schema(description = "여행 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID tripId,

		@Schema(description = "코스 version. 전체 교체로 실제 바뀐 게 있을 때만 오른다. 교체 요청의 expectedVersion으로 보낸다",
				example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
		long version,

		@Schema(description = "코스 항목(날짜·순서 순)", requiredMode = Schema.RequiredMode.REQUIRED)
		List<ItineraryItemResponse> items,

		@Schema(description = "구간(날짜·출발 순서 순)", requiredMode = Schema.RequiredMode.REQUIRED)
		List<RouteLegResponse> legs,

		@Schema(description = "마지막으로 코스를 바꾼 멤버 ID. 새 여행이면 방장", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e80",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID updatedByMemberId,

		@Schema(description = "마지막 변경 시각(UTC)", example = "2026-11-03T01:00:00Z",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Instant updatedAt
) {
}
