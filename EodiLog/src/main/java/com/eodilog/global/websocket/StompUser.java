package com.eodilog.global.websocket;

import java.security.Principal;
import java.util.UUID;

// STOMP 세션의 사용자. 개인 큐(/user/...)는 getName()으로 받는 사람을 찾으므로 사용자 ID 문자열을 이름으로 쓴다
public record StompUser(UUID userId) implements Principal {

	@Override
	public String getName() {
		return userId.toString();
	}

}
