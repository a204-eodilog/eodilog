package com.eodilog.chat.realtime;

import com.eodilog.global.websocket.WebSocketConfig;
import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.domain.TripMemberStatus;
import com.eodilog.trip.repository.TripMemberRepository;
import com.eodilog.trip.repository.TripRepository;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.messaging.simp.SimpMessageSendingOperations;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

// 메시지 저장이 커밋된 뒤 그 방 여행의 "지금" ACTIVE 멤버 전원(보낸 사람 포함)의 개인 큐로 보낸다
// 받는 사람을 커밋 뒤에 다시 읽으므로, 나가기·내보내기·여행 삭제가 커밋되면 다음 메시지부터 받지 않는다
// 전달은 최선 노력이다. 놓친 메시지는 앱이 REST의 sequence로 채운다
// 규칙은 backend-b-followup.md §12-1(RT-7·RT-9)
@Slf4j
@Component
public class ChatRealtimePublisher implements DisposableBean {

	// 대기열이 차면 버린다. 요청 스레드가 전달을 기다리지 않게 하려는 것이고, 빠진 메시지는 앱이 sequence 빈칸으로 알아챈다
	private static final int QUEUE_CAPACITY = 1000;

	private final SimpMessageSendingOperations messagingTemplate;
	private final TripRepository tripRepository;
	private final TripMemberRepository tripMemberRepository;
	private final TransactionTemplate readOnlyTransaction;
	private final ThreadPoolTaskExecutor executor;

	public ChatRealtimePublisher(SimpMessageSendingOperations messagingTemplate, TripRepository tripRepository,
			TripMemberRepository tripMemberRepository, PlatformTransactionManager transactionManager) {
		this.messagingTemplate = messagingTemplate;
		this.tripRepository = tripRepository;
		this.tripMemberRepository = tripMemberRepository;
		this.readOnlyTransaction = new TransactionTemplate(transactionManager);
		this.readOnlyTransaction.setReadOnly(true);
		// AFTER_COMMIT 시점의 요청 스레드는 끝난 트랜잭션의 DB 연결을 아직 쥐고 있다. 거기서 받는 사람을 새 연결로 읽으면
		// 동시 전송이 커넥션 풀 크기를 넘을 때 서로 연결을 기다리며 멈출 수 있어, 조회와 전달은 별도 스레드 하나에서 한다
		// 스레드 하나라 메시지는 커밋 순서대로 나간다
		this.executor = new ThreadPoolTaskExecutor();
		this.executor.setCorePoolSize(1);
		this.executor.setMaxPoolSize(1);
		this.executor.setQueueCapacity(QUEUE_CAPACITY);
		this.executor.setThreadNamePrefix("chat-realtime-");
		this.executor.setRejectedExecutionHandler((task, pool) -> log.warn("Chat realtime queue full, event dropped"));
		this.executor.initialize();
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void onMessageCreated(ChatMessageCreatedEvent event) {
		executor.execute(() -> deliver(event));
	}

	@Override
	public void destroy() {
		executor.shutdown();
	}

	private void deliver(ChatMessageCreatedEvent event) {
		ChatRealtimeEvent payload = ChatRealtimeEvent.messageCreated(event.message());
		List<UUID> recipients;
		try {
			recipients = readOnlyTransaction.execute(status -> activeMembers(event.tripId()));
		} catch (RuntimeException ex) {
			log.warn("Chat realtime recipients lookup failed roomId={} sequence={} cause={}", payload.roomId(),
					event.message().sequence(), ex.getClass().getName());
			return;
		}
		for (UUID userId : recipients) {
			try {
				messagingTemplate.convertAndSendToUser(userId.toString(), WebSocketConfig.CHAT_QUEUE, payload);
			} catch (RuntimeException ex) {
				// 한 사람에게 실패해도 나머지에게는 보낸다. 본문은 로그에 남기지 않는다
				log.warn("Chat realtime delivery failed roomId={} sequence={} cause={}", payload.roomId(),
						event.message().sequence(), ex.getClass().getName());
			}
		}
	}

	private List<UUID> activeMembers(UUID tripId) {
		if (tripRepository.findByIdAndDeletedAtIsNull(tripId).isEmpty()) {
			return List.of();
		}
		return tripMemberRepository.findAllByTripIdInAndStatusOrderByJoinOrder(List.of(tripId), TripMemberStatus.ACTIVE)
				.stream().map(TripMember::getUserId).toList();
	}

}
