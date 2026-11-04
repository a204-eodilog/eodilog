package com.eodilog.visit.dto;

import com.eodilog.visit.domain.VisitEvidenceType;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

// 명세 §6 POST /trips/{tripId}/visits. 방문자는 요청자로 서버가 정하므로 받지 않는다. 검증은 VisitService가 한다
public record CreateVisitRequest(
		@Schema(description = "다녀온 장소 ID. places에 있는 장소면 코스에 없어도 된다", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6ea0",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID placeId,

		@Schema(description = "다녀온 시각(UTC). 지금보다 미래는 받지 않는다", example = "2026-11-14T01:00:00Z",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Instant visitedAt,

		@Schema(description = "방문 근거. 직접 체크는 MANUAL만 받는다(PHOTO는 사진 후보 확인으로만 생긴다)", example = "MANUAL",
				requiredMode = Schema.RequiredMode.REQUIRED)
		VisitEvidenceType evidenceType
) {
}
