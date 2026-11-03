package com.eodilog.poll.dto;

import io.swagger.v3.oas.annotations.media.Schema;

// 명세 §6 POST /trips/{tripId}/polls/{pollId}/candidates(정책 §13 V-10)
public record AddCandidateRequest(
		@Schema(description = "추가할 후보. 투표 유형에 맞는 ID 하나", requiredMode = Schema.RequiredMode.REQUIRED)
		CandidateInput candidate,

		@Schema(description = "조회한 투표의 version. 다르면 409", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
		Long expectedVersion
) {
}
