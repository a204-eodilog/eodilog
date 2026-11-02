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

// 여행당 그룹 채팅방 하나. 메시지 순번(next_sequence)은 방 행을 잠근 뒤 하나씩 발급한다
@Entity
@Table(name = "chat_rooms")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatRoom {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID tripId;

	// 다음 메시지 순번. 방 행을 잠근 뒤에만 꺼낸다
	private long nextSequence;

	private Instant createdAt;

	public static ChatRoom open(UUID tripId, Instant now) {
		ChatRoom room = new ChatRoom();
		room.tripId = tripId;
		room.nextSequence = 1;
		room.createdAt = now;
		return room;
	}

	// 방 안에서 빈틈없이 1씩 늘어나는 순번을 발급한다. 호출 측이 방 행을 잠가야 한다
	public long takeNextSequence() {
		return nextSequence++;
	}

}
