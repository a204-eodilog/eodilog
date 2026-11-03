package com.eodilog.poll.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

// 명세 §10 Poll.candidates 항목. 득표 수는 OPEN이면 지금 ACTIVE 멤버의 표, 마감했으면 마감 때 고정한 값이다
public record PollCandidateResponse(
		@Schema(description = "후보 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e30",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "지역 ID. 장소 투표면 null", requiredMode = Schema.RequiredMode.REQUIRED, nullable = true)
		UUID regionId,

		@Schema(description = "장소 ID. 지역 투표면 null", requiredMode = Schema.RequiredMode.REQUIRED, nullable = true)
		UUID placeId,

		@Schema(description = "득표 수", example = "2", requiredMode = Schema.RequiredMode.REQUIRED)
		int voteCount,

		@Schema(description = "후보를 추가한 시각(UTC)", example = "2026-11-02T12:00:00Z",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Instant addedAt
) {
}
