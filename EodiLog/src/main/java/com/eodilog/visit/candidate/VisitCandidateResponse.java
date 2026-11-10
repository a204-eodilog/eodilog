package com.eodilog.visit.candidate;

import com.eodilog.place.dto.PlaceView;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

// 명세 §10 VisitCandidate. 후보는 실제 방문으로 집계하지 않는다
@Schema(description = "사진 방문 후보. 본인이 확정하기 전에는 실제 방문이 아니다")
public record VisitCandidateResponse(
		@Schema(description = "후보 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6ed0", requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,
		@Schema(description = "후보의 방문자(요청한 본인) 멤버십 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e80",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID memberId,
		@Schema(description = "추정한 장소", requiredMode = Schema.RequiredMode.REQUIRED)
		PlaceView place,
		@Schema(description = "추정한 방문 시각(UTC). 근거 사진 중 가장 이른 촬영 시각", example = "2026-11-14T01:00:00Z",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Instant visitedAt,
		@Schema(description = "근거 사진 ID", requiredMode = Schema.RequiredMode.REQUIRED)
		List<UUID> evidencePhotoIds,
		@Schema(description = "PENDING: 확정 대기 / CONFIRMED: 확정됨 / INVALIDATED: 근거 사진 이동·삭제 등으로 무효", example = "PENDING",
				requiredMode = Schema.RequiredMode.REQUIRED)
		String status,
		@Schema(description = "후보 version. 확정 요청의 expectedVersion", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
		long version,
		@Schema(description = "확정으로 연결된 방문 ID. 미확정이면 null", nullable = true, requiredMode = Schema.RequiredMode.REQUIRED)
		UUID visitId) {
}
