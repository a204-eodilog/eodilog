package com.eodilog.chat.realtime;

import com.eodilog.chat.dto.MessageResponse;
import java.util.UUID;

// /user/queue/chat으로 받는 이벤트. message는 REST의 Message(명세 §10)와 같은 모양이다
public record ChatRealtimeEvent(String type, UUID roomId, MessageResponse message) {

	public static final String MESSAGE_CREATED = "MESSAGE_CREATED";

	public static ChatRealtimeEvent messageCreated(MessageResponse message) {
		return new ChatRealtimeEvent(MESSAGE_CREATED, message.roomId(), message);
	}

}
