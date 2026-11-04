package com.eodilog.global.websocket;

import com.eodilog.global.common.error.CommonErrorCode;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.MessageChannel;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

// access 토큰 만료 시각에 연결을 끊는다(후속 문서 §12-1 RT-4). ERROR UNAUTHENTICATED를 보내면 Spring이 연결을 닫고,
// 앱은 토큰을 갱신해 다시 연결한 뒤 REST로 빠진 메시지를 채운다. 로그아웃·갱신으로 폐기된 세션도 늦어도 이 시각에는 끊긴다
@Component
public class StompSessionExpiry {

	private final Map<String, ScheduledFuture<?>> scheduled = new ConcurrentHashMap<>();
	private final TaskScheduler scheduler;
	private final MessageChannel clientOutboundChannel;
	private final StompErrors stompErrors;

	// 두 빈 모두 브로커 설정이 만들고, 그 설정이 인증 인터셉터(→ 이 빈)를 쓰므로 늦게 주입한다
	public StompSessionExpiry(@Lazy @Qualifier("messageBrokerTaskScheduler") TaskScheduler scheduler,
			@Lazy @Qualifier("clientOutboundChannel") MessageChannel clientOutboundChannel, StompErrors stompErrors) {
		this.scheduler = scheduler;
		this.clientOutboundChannel = clientOutboundChannel;
		this.stompErrors = stompErrors;
	}

	public void schedule(String sessionId, Instant expiresAt) {
		ScheduledFuture<?> previous = scheduled.put(sessionId, scheduler.schedule(() -> expire(sessionId), expiresAt));
		if (previous != null) {
			previous.cancel(false);
		}
	}

	@EventListener
	public void onDisconnect(SessionDisconnectEvent event) {
		ScheduledFuture<?> future = scheduled.remove(event.getSessionId());
		if (future != null) {
			future.cancel(false);
		}
	}

	private void expire(String sessionId) {
		if (scheduled.remove(sessionId) == null) {
			return;
		}
		clientOutboundChannel.send(
				stompErrors.error(CommonErrorCode.UNAUTHENTICATED, StompErrors.newTraceId(), sessionId));
	}

}
