package com.eodilog.global.websocket;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

// 서버 → 앱 실시간 전달용 STOMP over WebSocket(2026-11-04 A·B 합의, 규칙은 backend-b-followup.md §12-1). 보내기는 REST이고 여기서는 받기만 한다
// 인증은 핸드셰이크가 아니라 CONNECT 프레임의 Authorization 헤더로 한다(StompAuthInterceptor). /ws 공개는 SecurityConfig(A)에 있다
// 서버 한 대 기준 내장 simple broker다. 서버를 늘리면 외부 브로커 릴레이로 바꾸고 이벤트 형식은 그대로 둔다
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

	public static final String ENDPOINT = "/ws";
	public static final String USER_DESTINATION_PREFIX = "/user";
	// 받는 사람별 개인 큐. 클라이언트는 /user/queue/chat 하나만 구독한다
	public static final String CHAT_QUEUE = "/queue/chat";
	public static final String CHAT_SUBSCRIPTION = USER_DESTINATION_PREFIX + CHAT_QUEUE;
	public static final long HEARTBEAT_MILLIS = 10_000;

	private final StompAuthInterceptor stompAuthInterceptor;
	private final StompErrorHandler stompErrorHandler;
	private TaskScheduler messageBrokerTaskScheduler;

	public WebSocketConfig(StompAuthInterceptor stompAuthInterceptor, StompErrorHandler stompErrorHandler) {
		this.stompAuthInterceptor = stompAuthInterceptor;
		this.stompErrorHandler = stompErrorHandler;
	}

	// 브로커 설정이 만드는 빈이라 순환 참조를 피하려고 늦게 주입한다(Spring 문서 방식)
	@Autowired
	public void setMessageBrokerTaskScheduler(@Lazy @Qualifier("messageBrokerTaskScheduler") TaskScheduler scheduler) {
		this.messageBrokerTaskScheduler = scheduler;
	}

	// 인증이 쿠키가 아니라 CONNECT 헤더의 토큰이라 다른 사이트가 사용자 대신 연결해도 얻는 것이 없다(CSWSH 대상 아님)
	// 앱은 Origin을 보내지 않거나 프록시 뒤에서 서버 주소와 달라질 수 있어 origin으로 막지 않는다
	@Override
	public void registerStompEndpoints(StompEndpointRegistry registry) {
		registry.addEndpoint(ENDPOINT).setAllowedOriginPatterns("*");
		registry.setErrorHandler(stompErrorHandler);
	}

	@Override
	public void configureMessageBroker(MessageBrokerRegistry registry) {
		registry.enableSimpleBroker("/queue")
				.setHeartbeatValue(new long[] {HEARTBEAT_MILLIS, HEARTBEAT_MILLIS})
				.setTaskScheduler(messageBrokerTaskScheduler);
		registry.setUserDestinationPrefix(USER_DESTINATION_PREFIX);
	}

	@Override
	public void configureClientInboundChannel(ChannelRegistration registration) {
		registration.interceptors(stompAuthInterceptor);
	}

}
