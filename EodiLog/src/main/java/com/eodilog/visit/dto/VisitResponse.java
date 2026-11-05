package com.eodilog.visit.dto;

import com.eodilog.visit.domain.Review;
import com.eodilog.visit.domain.Visit;
import com.eodilog.visit.domain.VisitEvidenceType;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

// 명세 §10 Visit. 평가를 쓰지 않은 방문은 reviewId·reviewScore가 null이다
public record VisitResponse(
		@Schema(description = "방문 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6eb0", requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "여행 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70", requiredMode = Schema.RequiredMode.REQUIRED)
		UUID tripId,

		@Schema(description = "방문한 멤버십 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e80",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID memberId,

		@Schema(description = "장소 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6ea0", requiredMode = Schema.RequiredMode.REQUIRED)
		UUID placeId,

		@Schema(description = "다녀온 시각(UTC)", example = "2026-11-14T01:00:00Z", requiredMode = Schema.RequiredMode.REQUIRED)
		Instant visitedAt,

		@Schema(description = "방문 근거. MANUAL: 직접 체크 / PHOTO: 사진 후보 확인", example = "MANUAL",
				requiredMode = Schema.RequiredMode.REQUIRED)
		VisitEvidenceType evidenceType,

		@Schema(description = "이 방문의 평가 ID. 평가를 쓰지 않았으면 null", nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID reviewId,

		@Schema(description = "이 방문의 평가 점수(1~5). 평가를 쓰지 않았으면 null", nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		Integer reviewScore
) {

	// review는 없으면 null
	public static VisitResponse of(Visit visit, Review review) {
		return new VisitResponse(visit.getId(), visit.getTripId(), visit.getMemberId(), visit.getPlaceId(),
				visit.getVisitedAt(), visit.getEvidenceType(), review == null ? null : review.getId(),
				review == null ? null : review.getScore());
	}

}
