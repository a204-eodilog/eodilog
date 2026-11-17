package com.eodilog.invitation.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

public record SendFriendInvitationsRequest(
		@Schema(description = "초대할 회원 ID. 1~19명, 나와 맞팔인 회원만 보낸다", requiredMode = Schema.RequiredMode.REQUIRED)
		List<UUID> inviteeUserIds
) {
}
