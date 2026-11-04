package com.eodilog.global.websocket;

import com.eodilog.global.common.error.ErrorCode;
import com.eodilog.global.common.error.ErrorResponse;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Component;
import org.springframework.util.MimeTypeUtils;
import tools.jackson.databind.json.JsonMapper;

// STOMP ERROR 프레임. message 헤더에 오류 코드, 본문은 REST와 같은 {"error":{code,message,fields,traceId}}
// 서버는 ERROR 프레임을 보낸 뒤 연결을 닫는다(StompSubProtocolHandler)
@Component
@RequiredArgsConstructor
public class StompErrors {

	private final JsonMapper jsonMapper;

	// WebSocket 프레임은 TraceIdFilter를 거치지 않으므로 오류마다 새로 만들어 로그와 응답에 같은 값을 쓴다
	public static String newTraceId() {
		return UUID.randomUUID().toString().replace("-", "");
	}

	// sessionId는 서버가 먼저 보내는 ERROR(토큰 만료)에서만 넣는다. 클라이언트 프레임 처리 실패는 Spring이 그 세션으로 보낸다
	public Message<byte[]> error(ErrorCode errorCode, String traceId, String sessionId) {
		StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.ERROR);
		accessor.setMessage(errorCode.code());
		accessor.setContentType(MimeTypeUtils.APPLICATION_JSON);
		if (sessionId != null) {
			accessor.setSessionId(sessionId);
		}
		accessor.setLeaveMutable(true);
		byte[] payload = jsonMapper.writeValueAsBytes(ErrorResponse.of(errorCode, traceId));
		return MessageBuilder.createMessage(payload, accessor.getMessageHeaders());
	}

}
