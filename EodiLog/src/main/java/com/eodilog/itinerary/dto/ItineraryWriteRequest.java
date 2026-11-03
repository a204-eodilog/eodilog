package com.eodilog.itinerary.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

// 명세 §10 ItineraryWrite. 현재 코스를 통째로 바꾼다. 요청에 없는 기존 항목은 지워진다
public record ItineraryWriteRequest(
		@Schema(description = "조회한 코스의 version. 다르면 409", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
		Long expectedVersion,

		@Schema(description = "코스 항목 전체(최대 200개). 빈 배열이면 코스를 비운다", requiredMode = Schema.RequiredMode.REQUIRED)
		List<ItineraryItemInput> items,

		@Schema(description = "구간 전체. 같은 날짜의 인접한 항목 쌍마다 정확히 하나. 하루에 항목이 하나면 그 날은 구간 없음",
				requiredMode = Schema.RequiredMode.REQUIRED)
		List<RouteLegInput> legs
) {
}
