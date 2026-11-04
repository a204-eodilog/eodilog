package com.eodilog.chat.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

// 채팅 메시지 한 건. 지금은 사용자가 보낸 TEXT만 만든다. 편집은 없고(Q-13 범위 밖), 삭제는 나가기의 본문 제거만 있다(OwnMessageCleaner)
@Entity
@Table(name = "messages")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Message {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID roomId;

	private UUID senderUserId;

	@Enumerated(EnumType.STRING)
	private MessageType type;

	private long sequence;

	private String text;

	private UUID clientMessageId;

	private UUID eventId;

	private Instant createdAt;

	private Instant deletedAt;

	public static Message text(UUID roomId, UUID senderUserId, long sequence, String text, UUID clientMessageId,
			Instant now) {
		Message message = new Message();
		message.roomId = roomId;
		message.senderUserId = senderUserId;
		message.type = MessageType.TEXT;
		message.sequence = sequence;
		message.text = text;
		message.clientMessageId = clientMessageId;
		message.createdAt = now;
		return message;
	}

}
