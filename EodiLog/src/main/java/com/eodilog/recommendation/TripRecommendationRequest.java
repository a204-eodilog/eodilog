package com.eodilog.recommendation;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

// POST /trips/{tripId}/recommendations 본문(명세 §5). 표에 없는 필드는 공통 설정이 400으로 막는다
public record TripRecommendationRequest(
		@Schema(description = "후보 장소를 이 지역(하위 지역 포함)에서만 고른다. 없으면 여행지 전체", nullable = true,
				example = "019a42dc-0000-7000-8000-000000000001")
		UUID regionId
) {
}
