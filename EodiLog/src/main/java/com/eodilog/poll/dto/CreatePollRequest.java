package com.eodilog.poll.dto;

import com.eodilog.poll.domain.PollType;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

// 명세 §6 POST /trips/{tripId}/polls. 검증은 PollService가 한다(정책 §13 V-4·V-5)
public record CreatePollRequest(
		@Schema(description = "투표 유형", example = "PLACE", requiredMode = Schema.RequiredMode.REQUIRED)
		PollType type,

		@Schema(description = "투표 제목. 앞뒤 공백 제거 후 1~200자", example = "첫날 저녁 어디서 먹을까?",
				requiredMode = Schema.RequiredMode.REQUIRED)
		String title,

		@Schema(description = "후보 1~30개. 유형에 맞는 ID만, 중복 없이", requiredMode = Schema.RequiredMode.REQUIRED)
		List<CandidateInput> candidates,

		@Schema(description = "마감 시각(UTC). 지금보다 미래이고 30일 이내. 화면 기본값은 지금+24시간",
				example = "2026-11-03T12:00:00Z", requiredMode = Schema.RequiredMode.REQUIRED)
		Instant closesAt
) {
}
