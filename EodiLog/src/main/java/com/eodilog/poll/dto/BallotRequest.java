package com.eodilog.poll.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

// 명세 §6 PUT /trips/{tripId}/polls/{pollId}/ballot. 내 선택 전체 교체, 빈 배열은 취소(정책 §13 V-7)
public record BallotRequest(
		@Schema(description = "고를 후보 ID 목록. 여러 개 고를 수 있고, 빈 배열이면 내 선택을 취소한다",
				requiredMode = Schema.RequiredMode.REQUIRED)
		List<UUID> candidateIds,

		@Schema(description = "조회한 투표의 version. 그 사이 후보가 추가됐거나 마감됐으면 409", example = "1",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Long expectedVersion
) {
}
