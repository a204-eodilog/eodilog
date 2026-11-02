package com.eodilog.chat.dto;

import com.eodilog.user.dto.UserCard;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

// 명세 §10 ChatRoom. 여행당 그룹 채팅방 하나라 type은 항상 TRIP
public record ChatRoomResponse(
		@Schema(description = "채팅방 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e71",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "채팅방 종류. 여행 그룹 채팅만 있다", example = "TRIP", requiredMode = Schema.RequiredMode.REQUIRED)
		String type,

		@Schema(description = "여행 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID tripId,

		@Schema(description = "지금 참여 중인 동행(참여 순)", requiredMode = Schema.RequiredMode.REQUIRED)
		List<UserCard> participants,

		@Schema(description = "가장 최근 메시지. 아직 없으면 null", nullable = true, requiredMode = Schema.RequiredMode.REQUIRED)
		MessageResponse lastMessage
) {

	public static final String TYPE_TRIP = "TRIP";

}
