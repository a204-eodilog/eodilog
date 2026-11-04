package com.eodilog.chat.realtime;

import com.eodilog.chat.dto.MessageResponse;
import java.util.UUID;

// 채팅방에 메시지가 새로 저장됐다. 같은 clientMessageId의 재전송(처음 메시지를 돌려줌)은 내지 않는다
public record ChatMessageCreatedEvent(UUID tripId, MessageResponse message) {
}
