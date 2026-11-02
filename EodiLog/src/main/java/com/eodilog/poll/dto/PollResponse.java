package com.eodilog.poll.dto;

import com.eodilog.poll.domain.PollClosedReason;
import com.eodilog.poll.domain.PollStatus;
import com.eodilog.poll.domain.PollType;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

// 명세 §10 Poll. 집계(candidates.voteCount)와 확정 결과(selectedCandidateIds)를 나눠 보여 준다
public record PollResponse(
		@Schema(description = "투표 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e40",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "여행 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID tripId,

		@Schema(description = "투표 유형", example = "PLACE", requiredMode = Schema.RequiredMode.REQUIRED)
		PollType type,

		@Schema(description = "투표 제목", example = "첫날 저녁 어디서 먹을까?", requiredMode = Schema.RequiredMode.REQUIRED)
		String title,

		@Schema(description = "OPEN: 진행 중 / FINALIZED: 최다 후보 확정 / CLOSED: 0표라 확정 없이 마감", example = "OPEN",
				requiredMode = Schema.RequiredMode.REQUIRED)
		PollStatus status,

		@Schema(description = "투표 version. 후보 추가·마감 때만 오른다. 내 선택·후보 추가 때 expectedVersion으로 보낸다",
				example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
		long version,

		@Schema(description = "마감 시각(UTC)", example = "2026-11-03T12:00:00Z", requiredMode = Schema.RequiredMode.REQUIRED)
		Instant closesAt,

		@Schema(description = "마감 이유. DEADLINE: 확정 / NO_VOTES: 0표. 진행 중이면 null",
				requiredMode = Schema.RequiredMode.REQUIRED, nullable = true)
		PollClosedReason closedReason,

		@Schema(description = "투표할 수 있는 인원. 진행 중이면 지금 ACTIVE 멤버 수, 마감했으면 마감 때 수", example = "4",
				requiredMode = Schema.RequiredMode.REQUIRED)
		int eligibleMemberCount,

		@Schema(description = "한 표 이상 던진 인원. 여행에서 나간 멤버는 세지 않는다", example = "3",
				requiredMode = Schema.RequiredMode.REQUIRED)
		int votedMemberCount,

		@Schema(description = "후보 목록(입력·추가한 순서)", requiredMode = Schema.RequiredMode.REQUIRED)
		List<PollCandidateResponse> candidates,

		@Schema(description = "내가 고른 후보 ID", requiredMode = Schema.RequiredMode.REQUIRED)
		List<UUID> myCandidateIds,

		@Schema(description = "확정된 후보 ID. 최다 득표 후보 전부(동률 포함). 진행 중이거나 0표면 []",
				requiredMode = Schema.RequiredMode.REQUIRED)
		List<UUID> selectedCandidateIds
) {
}
