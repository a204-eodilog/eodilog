package com.eodilog.visit.dto;

import com.eodilog.place.dto.PlaceView;
import com.eodilog.visit.domain.Review;
import com.eodilog.visit.domain.Visit;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

// 명세 §10 Review에 방문·장소 요약을 덧붙였다(정책 §18 R-7). 평가 목록 화면(S33)이 장소 이름·방문 시각을 한 번에 보여 준다
public record ReviewResponse(
		@Schema(description = "평가 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6ec0", requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "평가한 방문 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6eb0",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID visitId,

		@Schema(description = "작성자 멤버십 ID(방문한 멤버)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e80",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID authorMemberId,

		@Schema(description = "점수(1~5)", example = "4", requiredMode = Schema.RequiredMode.REQUIRED)
		int score,

		@Schema(description = "평가 본문", example = "바다가 보이는 자리라 좋았어요.", requiredMode = Schema.RequiredMode.REQUIRED)
		String body,

		@Schema(description = "평가 version. 점수·본문이 바뀔 때만 오른다", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
		long version,

		@Schema(description = "처음 쓴 시각(UTC)", example = "2026-11-14T03:00:00Z", requiredMode = Schema.RequiredMode.REQUIRED)
		Instant createdAt,

		@Schema(description = "마지막으로 바뀐 시각(UTC)", example = "2026-11-14T03:00:00Z", requiredMode = Schema.RequiredMode.REQUIRED)
		Instant updatedAt,

		@Schema(description = "평가한 방문 요약", requiredMode = Schema.RequiredMode.REQUIRED)
		ReviewVisit visit,

		@Schema(description = "방문한 장소 요약. 장소를 읽지 못하면 null", nullable = true, requiredMode = Schema.RequiredMode.REQUIRED)
		ReviewPlace place
) {

	public record ReviewVisit(
			@Schema(description = "장소 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6ea0",
					requiredMode = Schema.RequiredMode.REQUIRED)
			UUID placeId,

			@Schema(description = "다녀온 시각(UTC)", example = "2026-11-14T01:00:00Z", requiredMode = Schema.RequiredMode.REQUIRED)
			Instant visitedAt
	) {
	}

	public record ReviewPlace(
			@Schema(description = "장소 이름", example = "협재 해수욕장", requiredMode = Schema.RequiredMode.REQUIRED)
			String name,

			@Schema(description = "주소. 없으면 null", example = "제주특별자치도 제주시 한림읍 협재리", nullable = true,
					requiredMode = Schema.RequiredMode.REQUIRED)
			String address
	) {
	}

	public static ReviewResponse of(Review review, Visit visit, PlaceView place) {
		return new ReviewResponse(review.getId(), review.getVisitId(), visit.getMemberId(), review.getScore(),
				review.getBody(), review.getVersion(), review.getCreatedAt(), review.getUpdatedAt(),
				new ReviewVisit(visit.getPlaceId(), visit.getVisitedAt()),
				place == null ? null : new ReviewPlace(place.name(), place.address()));
	}

}
