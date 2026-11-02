package com.eodilog.chat.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 참여·이탈은 여행 멤버십 변경과 같은 트랜잭션에서 맞춘다. ACTIVE 멤버는 신규·재참여 모두 처음부터 전체 대화를 보므로(Q-13, 2026-11-02) visible_from_sequence는 1 그대로다
@Entity
@Table(name = "chat_participants")
@IdClass(ChatParticipantId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatParticipant {

	@Id
	private UUID roomId;

	@Id
	private UUID userId;

	private Instant joinedAt;

	private Instant leftAt;

	public static ChatParticipant join(UUID roomId, UUID userId, Instant now) {
		ChatParticipant participant = new ChatParticipant();
		participant.roomId = roomId;
		participant.userId = userId;
		participant.joinedAt = now;
		return participant;
	}

	// 행은 남기고 이탈 시각만 기록한다
	public void leave(Instant now) {
		this.leftAt = now;
	}

	// 같은 행을 다시 쓴다. 재참여해도 처음부터 전체 대화를 본다(Q-13)
	public void rejoin(Instant now) {
		this.joinedAt = now;
		this.leftAt = null;
	}

}
