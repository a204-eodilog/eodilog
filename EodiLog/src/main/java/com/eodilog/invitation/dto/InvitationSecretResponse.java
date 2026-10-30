package com.eodilog.invitation.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

// 토큰 원문은 이 응답에서만 볼 수 있다. 서버는 해시만 보관하므로 다시 조회할 수 없다
public record InvitationSecretResponse(
		@Schema(description = "초대 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e90",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "초대 토큰 원문(43자). 생성 응답에서만 반환", example = "q3Jx0b6m7c1Yd9uK2fZtP4sWnL8eHvRa5gCiOyTjXkE",
				requiredMode = Schema.RequiredMode.REQUIRED)
		String token,

		@Schema(description = "공유할 초대 링크", example = "ieohaeng://invitations/q3Jx0b6m7c1Yd9uK2fZtP4sWnL8eHvRa5gCiOyTjXkE",
				requiredMode = Schema.RequiredMode.REQUIRED)
		String url,

		@Schema(description = "만료 시각(UTC). 생성 후 7일", example = "2026-11-06T05:30:00Z",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Instant expiresAt
) {
}
