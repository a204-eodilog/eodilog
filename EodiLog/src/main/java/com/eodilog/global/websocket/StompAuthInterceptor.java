package com.eodilog.global.websocket;

import com.eodilog.domain.auth.AuthErrorCode;
import com.eodilog.domain.auth.AuthService;
import com.eodilog.domain.auth.Tokens;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

// 클라이언트가 보낸 STOMP 프레임 검사. 여기서 던진 업무 오류는 StompErrorHandler가 ERROR 프레임으로 바꾸고 연결이 닫힌다
// CONNECT: REST의 BearerFilter와 같은 검사(토큰 서명·만료 → 세션 폐기 여부 → 가입 완료). 가입 대기는 PROFILE_INCOMPLETE
// SUBSCRIBE: 인증된 세션이 /user/queue/chat만. SEND: 보내기는 REST라 받지 않는다(FORBIDDEN)
@Component
@RequiredArgsConstructor
public class StompAuthInterceptor implements ChannelInterceptor {

	private static final String AUTHORIZATION = "Authorization";
	private static final String BEARER = "Bearer ";

	private final Tokens tokens;
	private final AuthService authService;
	private final StompSessionExpiry sessionExpiry;

	@Override
	public Message<?> preSend(Message<?> message, MessageChannel channel) {
		StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
		// 하트비트는 명령이 없다
		if (accessor == null || accessor.getCommand() == null) {
			return message;
		}
		StompCommand command = accessor.getCommand();
		if (command == StompCommand.CONNECT || command == StompCommand.STOMP) {
			authenticate(accessor);
		} else if (command == StompCommand.SUBSCRIBE) {
			requireUser(accessor);
			if (!WebSocketConfig.CHAT_SUBSCRIPTION.equals(accessor.getDestination())) {
				throw new BusinessException(CommonErrorCode.FORBIDDEN);
			}
		} else if (command == StompCommand.SEND) {
			requireUser(accessor);
			throw new BusinessException(CommonErrorCode.FORBIDDEN);
		}
		return message;
	}

	private void authenticate(StompHeaderAccessor accessor) {
		String header = accessor.getFirstNativeHeader(AUTHORIZATION);
		if (header == null || header.length() <= BEARER.length()
				|| !header.regionMatches(true, 0, BEARER, 0, BEARER.length())) {
			throw new BusinessException(CommonErrorCode.UNAUTHENTICATED);
		}
		Tokens.Claims claims = tokens.verify(header.substring(BEARER.length()));
		if (!authService.authenticate(claims).profileCompleted()) {
			throw new BusinessException(AuthErrorCode.PROFILE_INCOMPLETE);
		}
		accessor.setUser(new StompUser(claims.userId()));
		sessionExpiry.schedule(accessor.getSessionId(), claims.expiresAt());
	}

	// CONNECT 없이 온 프레임은 사용자가 없다
	private static void requireUser(StompHeaderAccessor accessor) {
		if (!(accessor.getUser() instanceof StompUser)) {
			throw new BusinessException(CommonErrorCode.UNAUTHENTICATED);
		}
	}

}
