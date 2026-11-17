package com.eodilog.invitation.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

// 받는 사람마다 결과가 다르다. 한 사람이 안 돼도 나머지는 보낸다
public record SendFriendInvitationsResponse(
		@Schema(description = "요청한 순서대로(중복 제거) 사람별 결과", requiredMode = Schema.RequiredMode.REQUIRED)
		List<Result> results
) {

	public enum Outcome { SENT, ALREADY_INVITED, ALREADY_MEMBER, NOT_MUTUAL }

	public record Result(
			@Schema(description = "회원 ID", requiredMode = Schema.RequiredMode.REQUIRED)
			UUID userId,

			@Schema(description = "SENT: 새로 보냄, ALREADY_INVITED: 대기 중인 초대가 이미 있음(알림 다시 안 보냄), "
					+ "ALREADY_MEMBER: 이미 동행, NOT_MUTUAL: 맞팔이 아니거나 없는 회원",
					requiredMode = Schema.RequiredMode.REQUIRED)
			Outcome result,

			@Schema(description = "SENT·ALREADY_INVITED일 때 초대 ID", nullable = true,
					requiredMode = Schema.RequiredMode.REQUIRED)
			UUID invitationId
	) {
	}

}
