package com.eodilog.chat.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

// 여행당 그룹 채팅방 하나. 메시지 순번(next_sequence)은 메시지 기능에서 다룬다
@Entity
@Table(name = "chat_rooms")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatRoom {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID tripId;

	private Instant createdAt;

	public static ChatRoom open(UUID tripId, Instant now) {
		ChatRoom room = new ChatRoom();
		room.tripId = tripId;
		room.createdAt = now;
		return room;
	}

}
