package com.eodilog.chat.dto;

import com.eodilog.chat.domain.Message;
import com.eodilog.chat.domain.MessageType;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

// 명세 §10 Message. 시스템 카드(eventId·target·eventReadAt)는 이벤트 기능이 생기기 전까지 null이다
public record MessageResponse(
		@Schema(description = "메시지 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6ec0",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "채팅방 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e71",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID roomId,

		@Schema(description = "방 안의 순번. 1부터 빈틈없이 늘어난다", example = "12", requiredMode = Schema.RequiredMode.REQUIRED)
		long sequence,

		@Schema(description = "보낸 사용자 ID. 시스템 메시지는 null", example = "3f2b8c1e-5d4a-4e7b-9c1f-2a6d8e0b7c45",
				nullable = true, requiredMode = Schema.RequiredMode.REQUIRED)
		UUID senderId,

		@Schema(description = "메시지 종류", example = "TEXT", requiredMode = Schema.RequiredMode.REQUIRED)
		MessageType type,

		@Schema(description = "본문. 보낸 사람이 나가면서 지운 메시지(deletedAt 있음)와 시스템 메시지는 null일 수 있다",
				example = "내일 9시에 만나요", nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		String text,

		@Schema(description = "보낼 때 클라이언트가 만든 ID. 시스템 메시지는 null",
				example = "6d0f7c2e-1b7a-4f0e-9a51-7f3c1e2d4b8a", nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID clientMessageId,

		@Schema(description = "시스템 카드의 이벤트 ID. 아직 항상 null", nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID eventId,

		@Schema(description = "시스템 카드가 가리키는 대상. 아직 항상 null", nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		Target target,

		@Schema(description = "시스템 카드 읽음 시각. 아직 항상 null", nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		Instant eventReadAt,

		@Schema(description = "보낸 시각(UTC)", example = "2026-11-02T02:10:00Z", requiredMode = Schema.RequiredMode.REQUIRED)
		Instant createdAt,

		@Schema(description = "본문을 지운 시각. 보낸 사람이 나가기에서 '내 채팅 삭제'를 고른 메시지만 값이 있다. 자리(순번)는 남는다",
				nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		Instant deletedAt
) {

	public record Target(
			@Schema(description = "대상 종류", requiredMode = Schema.RequiredMode.REQUIRED) String type,
			@Schema(description = "대상 ID", requiredMode = Schema.RequiredMode.REQUIRED) UUID id
	) {
	}

	public static MessageResponse of(Message message) {
		return new MessageResponse(message.getId(), message.getRoomId(), message.getSequence(),
				message.getSenderUserId(), message.getType(), message.getText(), message.getClientMessageId(),
				message.getEventId(), null, null, message.getCreatedAt(), message.getDeletedAt());
	}

}
