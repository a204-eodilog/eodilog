package com.eodilog.invitation.dto;

import com.eodilog.user.dto.UserCard;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

// 여행 초대 화면의 맞팔 친구 목록. 초대할 수 있는 사람 → 초대한 사람 → 이미 동행 순, 같은 묶음은 닉네임 순이다
public record InvitableFriendsResponse(
		@Schema(description = "맞팔 친구와 이 여행 기준 상태", requiredMode = Schema.RequiredMode.REQUIRED)
		List<InvitableFriend> friends,

		@Schema(description = "지금 여행의 ACTIVE 멤버 수(방장 포함)", example = "4", requiredMode = Schema.RequiredMode.REQUIRED)
		int activeMemberCount,

		@Schema(description = "여행 정원", example = "20", requiredMode = Schema.RequiredMode.REQUIRED)
		int capacity,

		@Schema(description = "맞팔이 너무 많아 일부만 담았는지", example = "false", requiredMode = Schema.RequiredMode.REQUIRED)
		boolean truncated
) {

	public enum State { INVITABLE, INVITED, MEMBER }

	public record InvitableFriend(
			@Schema(description = "회원 카드", requiredMode = Schema.RequiredMode.REQUIRED)
			UserCard user,

			@Schema(description = "INVITABLE: 초대 가능, INVITED: 대기 중인 초대 있음, MEMBER: 이미 동행",
					requiredMode = Schema.RequiredMode.REQUIRED)
			State state,

			@Schema(description = "INVITED일 때 대기 중인 초대 ID. 그 밖에는 null", nullable = true,
					requiredMode = Schema.RequiredMode.REQUIRED)
			UUID invitationId
	) {
	}

}
