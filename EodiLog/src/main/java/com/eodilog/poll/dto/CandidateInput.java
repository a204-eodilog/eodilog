package com.eodilog.poll.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

// 명세 §10 CandidateInput. 투표 유형에 맞는 쪽 하나만 보낸다(지역 투표는 regionId, 장소 투표는 placeId)
public record CandidateInput(
		@Schema(description = "지역 ID. 지역 투표일 때만 보낸다", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e10",
				nullable = true)
		UUID regionId,

		@Schema(description = "장소 ID. 장소 투표일 때만 보낸다", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e20",
				nullable = true)
		UUID placeId
) {
}
