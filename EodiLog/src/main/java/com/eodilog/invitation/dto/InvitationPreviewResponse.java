package com.eodilog.invitation.dto;

import com.eodilog.user.dto.UserCard;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;

// 공개 응답이므로 여행명·기간·초대한 사람만 담는다. 동행 명단·경비는 넣지 않는다(명세 §4)
public record InvitationPreviewResponse(
		@Schema(description = "여행 이름", example = "제주 3박 4일", requiredMode = Schema.RequiredMode.REQUIRED)
		String tripTitle,

		@Schema(description = "시작일, 미정이면 null", example = "2026-11-01", nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		LocalDate startDate,

		@Schema(description = "종료일, 미정이면 null", example = "2026-11-04", nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		LocalDate endDate,

		@Schema(description = "초대한 사람", requiredMode = Schema.RequiredMode.REQUIRED)
		Inviter inviter,

		@Schema(description = "초대한 사람의 회원 카드. 로그인하지 않고 조회하면 null", nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		UserCard inviterUser,

		@Schema(description = "링크 만료 시각(UTC)", example = "2026-11-06T05:30:00Z",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Instant expiresAt
) {

	public record Inviter(
			@Schema(description = "닉네임", example = "여행대장", requiredMode = Schema.RequiredMode.REQUIRED)
			String nickname
	) {
	}

}
