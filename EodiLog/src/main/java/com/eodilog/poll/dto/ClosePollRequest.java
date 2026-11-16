package com.eodilog.poll.dto;

import io.swagger.v3.oas.annotations.media.Schema;

// 명세 §6 POST /trips/{tripId}/polls/{pollId}/close. 투표를 연 사람의 직접 종료(정책 §13 V-16)
public record ClosePollRequest(
		@Schema(description = "조회한 투표의 version. 그 사이 후보가 추가됐으면 409 VERSION_CONFLICT", example = "1",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Long expectedVersion
) {
}
