package com.eodilog.recommendation;

import com.eodilog.job.Job;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.region.dto.RegionView;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

// 명세 §10 RecommendationResult
@Schema(description = "AI 여행지 추천 결과. 작업이 끝나기 전·실패·취소면 items가 비어 있다")
public record TripRecommendationResponse(
		@Schema(description = "작업 상태. 실패·취소 사유는 job.error", requiredMode = Schema.RequiredMode.REQUIRED)
		Job job,

		@Schema(description = "추천. REGION은 지역(최대 3), PLACE는 그룹 즐겨찾기 밖 장소(최대 5)", requiredMode = Schema.RequiredMode.REQUIRED)
		List<Item> items,

		@Schema(description = "추천 근거 수", requiredMode = Schema.RequiredMode.REQUIRED)
		Basis basis,

		@Schema(description = "그룹 즐겨찾기 3곳·취향 있는 멤버 2명이 안 되면 true(items는 빈 배열)", example = "false",
				requiredMode = Schema.RequiredMode.REQUIRED)
		boolean insufficientData
) {

	public record Item(
			@Schema(description = "추천 종류", example = "PLACE", requiredMode = Schema.RequiredMode.REQUIRED) String type,
			@Schema(description = "REGION일 때 지역, 아니면 null", nullable = true) RegionView region,
			@Schema(description = "PLACE일 때 장소, 아니면 null", nullable = true) PlaceView place,
			@Schema(description = "추천 이유", example = "바다와 카페 취향이 겹쳐요", requiredMode = Schema.RequiredMode.REQUIRED) String reason
	) {
	}

	public record Basis(
			@Schema(description = "겹친(2명 이상 담은) 장소 수", example = "3", requiredMode = Schema.RequiredMode.REQUIRED) int sharedPlaceCount,
			@Schema(description = "취향을 반영한 멤버 수", example = "3", requiredMode = Schema.RequiredMode.REQUIRED) int usedMemberCount
	) {
	}

	static final Basis EMPTY_BASIS = new Basis(0, 0);

}
