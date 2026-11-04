package com.eodilog.chat.realtime;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.eodilog.TestcontainersConfiguration;
import com.eodilog.domain.auth.AuthProperties;
import com.eodilog.domain.auth.Tokens;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.global.websocket.WebSocketConfig;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.messaging.converter.JacksonJsonMessageConverter;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.broker.SimpleBrokerMessageHandler;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.messaging.simp.user.SimpSession;
import org.springframework.messaging.simp.user.SimpUser;
import org.springframework.messaging.simp.user.SimpUserRegistry;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 실제 서버 포트에 STOMP로 연결해 인증·구독 제한·커밋 뒤 전달·토큰 만료 종료를 확인한다(후속 문서 §12-1)
// 보내기는 REST(MockMvc)로 하고, 같은 애플리케이션의 브로커가 실제 WebSocket 세션으로 이벤트를 보낸다
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ChatRealtimeTest {

	// 첫 연결은 JIT·클라이언트 준비로 몇 초 걸릴 수 있어(빌드 중 다른 컨텍스트와 함께 돌 때) 넉넉히 기다린다
	private static final long WAIT_SECONDS = 10;

	@LocalServerPort
	private int port;

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	@Autowired
	private Tokens tokens;

	@Autowired
	private AuthProperties authProperties;

	@Autowired
	private SimpUserRegistry userRegistry;

	@Autowired
	private SimpleBrokerMessageHandler simpleBroker;

	private final List<WebSocketStompClient> clients = new ArrayList<>();
	private UUID ownerId;
	private UUID friendId;
	private UUID roomId;

	@BeforeEach
	void setUp() throws Exception {
		ownerId = insertUser("방장", true);
		friendId = insertUser("동행", true);
		UUID tripId = createTrip(ownerId);
		roomId = jdbcTemplate.queryForObject("select id from chat_rooms where trip_id = ?", UUID.class, tripId);
		insertActiveMember(tripId, friendId, 2);
	}

	@AfterEach
	void tearDown() {
		clients.forEach(WebSocketStompClient::stop);
	}

	@Test
	void deliversNewMessageToEveryActiveMemberIncludingSender() throws Exception {
		Listener owner = subscribe(ownerId);
		Listener friend = subscribe(friendId);
		Listener outsider = subscribe(insertUser("모르는 사람", true));
		UUID clientMessageId = UUID.randomUUID();

		send(ownerId, clientMessageId, "내일 9시에 만나요").andExpect(status().isCreated());

		for (Listener member : List.of(owner, friend)) {
			JsonNode event = member.nextEvent();
			assertThat(event.get("type").asString()).isEqualTo("MESSAGE_CREATED");
			assertThat(event.get("roomId").asString()).isEqualTo(roomId.toString());
			JsonNode message = event.get("message");
			assertThat(message.get("roomId").asString()).isEqualTo(roomId.toString());
			assertThat(message.get("sequence").asLong()).isEqualTo(1);
			assertThat(message.get("senderId").asString()).isEqualTo(ownerId.toString());
			assertThat(message.get("type").asString()).isEqualTo("TEXT");
			assertThat(message.get("text").asString()).isEqualTo("내일 9시에 만나요");
			assertThat(message.get("clientMessageId").asString()).isEqualTo(clientMessageId.toString());
			// REST 응답과 같은 ISO-8601 UTC 문자열
			assertThat(Instant.parse(message.get("createdAt").asString())).isBefore(Instant.now().plusSeconds(1));
			assertThat(message.get("deletedAt").isNull()).isTrue();
		}
		// 같은 clientMessageId 재전송은 새 메시지가 아니라 이벤트를 다시 보내지 않는다(§12-1 RT-8)
		send(ownerId, clientMessageId, "내일 9시에 만나요").andExpect(status().isCreated());
		send(friendId, UUID.randomUUID(), "좋아요").andExpect(status().isCreated());
		assertThat(owner.nextEvent().get("message").get("sequence").asLong()).isEqualTo(2);
		assertThat(friend.nextEvent().get("message").get("sequence").asLong()).isEqualTo(2);
		assertThat(outsider.events.poll(500, TimeUnit.MILLISECONDS)).isNull();
		assertThat(owner.events).isEmpty();
	}

	@Test
	void stopsDeliveringAfterMemberLeaves() throws Exception {
		Listener owner = subscribe(ownerId);
		Listener friend = subscribe(friendId);
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where user_id = ?", friendId);

		send(ownerId, UUID.randomUUID(), "다들 어디예요").andExpect(status().isCreated());

		assertThat(owner.nextEvent().get("message").get("sequence").asLong()).isEqualTo(1);
		assertThat(friend.events.poll(500, TimeUnit.MILLISECONDS)).isNull();
	}

	@Test
	void rejectsConnectWithoutValidSession() throws Exception {
		expectConnectError(null, "UNAUTHENTICATED");
		expectConnectError("Bearer not-a-token", "UNAUTHENTICATED");
		expectConnectError("Basic " + accessToken(ownerId), "UNAUTHENTICATED");

		String revoked = accessToken(ownerId);
		jdbcTemplate.update("update sessions set revoked_at = now() where id = ?", tokens.verify(revoked).sessionId());
		expectConnectError("Bearer " + revoked, "UNAUTHENTICATED");

		expectConnectError("Bearer " + accessToken(insertUser("", false)), "PROFILE_INCOMPLETE");
	}

	@Test
	void allowsOnlyChatQueueSubscriptionAndNoSend() throws Exception {
		Listener other = connect(ownerId);
		other.session.subscribe("/queue/chat-user" + UUID.randomUUID(), other.frames());
		other.expectErrorAndClose("FORBIDDEN");

		Listener sender = connect(ownerId);
		sender.session.send("/queue/chat", Map.of("text", "WebSocket으로 보내기"));
		sender.expectErrorAndClose("FORBIDDEN");

		assertThat(count("select count(*) from messages where room_id = ?", roomId)).isZero();
	}

	@Test
	void closesConnectionWhenAccessTokenExpires() throws Exception {
		Listener listener = connect(accessToken(ownerId, Instant.now().plusSeconds(2)));
		listener.subscribeChat();
		awaitSubscribed(ownerId);

		listener.expectErrorAndClose("UNAUTHENTICATED");
	}

	private Listener subscribe(UUID userId) throws Exception {
		Listener listener = connect(userId);
		listener.subscribeChat();
		awaitSubscribed(userId);
		return listener;
	}

	private Listener connect(UUID userId) throws Exception {
		return connect(accessToken(userId));
	}

	private Listener connect(String accessToken) throws Exception {
		Listener listener = new Listener();
		StompHeaders connectHeaders = new StompHeaders();
		connectHeaders.add("Authorization", "Bearer " + accessToken);
		listener.session = newClient().connectAsync(url(), new WebSocketHttpHeaders(), connectHeaders, listener)
				.get(WAIT_SECONDS, TimeUnit.SECONDS);
		return listener;
	}

	private void expectConnectError(String authorization, String code) throws Exception {
		Listener listener = new Listener();
		StompHeaders connectHeaders = new StompHeaders();
		if (authorization != null) {
			connectHeaders.add("Authorization", authorization);
		}
		CompletableFuture<StompSession> future = newClient().connectAsync(url(), new WebSocketHttpHeaders(),
				connectHeaders, listener);
		try {
			listener.expectErrorAndClose(code);
		} catch (AssertionError e) {
			// 실패 원인을 바로 알 수 있게 연결 상태와 클라이언트가 처리하지 못한 프레임을 함께 남긴다
			throw new AssertionError("connect=" + future + " transport=" + listener.transportErrors
					+ " unhandled=" + listener.unhandled, e);
		}
	}

	private WebSocketStompClient newClient() {
		WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
		client.setMessageConverter(new JacksonJsonMessageConverter(jsonMapper));
		client.setDefaultHeartbeat(new long[] {0, 0});
		clients.add(client);
		return client;
	}

	private String url() {
		return "ws://localhost:" + port + WebSocketConfig.ENDPOINT;
	}

	// SUBSCRIBE는 비동기로 브로커에 등록되므로, 메시지를 보내기 전에 브로커가 그 사용자의 큐를 알 때까지 기다린다
	private void awaitSubscribed(UUID userId) throws InterruptedException {
		Instant deadline = Instant.now().plusSeconds(WAIT_SECONDS);
		while (Instant.now().isBefore(deadline)) {
			SimpUser user = userRegistry.getUser(userId.toString());
			if (user != null && user.getSessions().stream().anyMatch(this::brokerHasChatSubscription)) {
				return;
			}
			Thread.sleep(20);
		}
		throw new AssertionError("subscription not registered: " + userId);
	}

	private boolean brokerHasChatSubscription(SimpSession session) {
		SimpMessageHeaderAccessor accessor = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
		accessor.setDestination(WebSocketConfig.CHAT_QUEUE + "-user" + session.getId());
		return !simpleBroker.getSubscriptionRegistry()
				.findSubscriptions(MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders())).isEmpty();
	}

	private ResultActions send(UUID userId, UUID clientMessageId, String text) throws Exception {
		return mockMvc.perform(post("/api/v1/chat/rooms/{roomId}/messages", roomId).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content(jsonMapper.writeValueAsString(Map.of("clientMessageId", clientMessageId, "text", text))));
	}

	private String accessToken(UUID userId) {
		return tokens.issue(userId, insertSession(userId));
	}

	// 만료가 짧은 토큰은 서버와 같은 비밀값·발급자로 직접 서명한다(본 설정의 access 수명은 1시간)
	private String accessToken(UUID userId, Instant expiresAt) throws Exception {
		SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), new JWTClaimsSet.Builder()
				.issuer(authProperties.issuer())
				.subject(userId.toString())
				.jwtID(insertSession(userId).toString())
				.issueTime(new Date())
				.expirationTime(Date.from(expiresAt))
				.build());
		jwt.sign(new MACSigner(authProperties.jwtSecret().getBytes(StandardCharsets.UTF_8)));
		return jwt.serialize();
	}

	private UUID insertSession(UUID userId) {
		UUID sessionId = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into sessions (id, user_id, refresh_token_hash, expires_at, created_at)
				values (?, ?, ?, now() + interval '1 day', now())""", sessionId, userId, "realtime-" + sessionId);
		return sessionId;
	}

	private UUID createTrip(UUID userId) throws Exception {
		String body = mockMvc.perform(post("/api/v1/trips").with(authUser(userId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"title\":\"제주\"}"))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		return UUID.fromString(jsonMapper.readTree(body).get("data").get("id").asString());
	}

	private UUID insertUser(String nickname, boolean profileCompleted) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, ?, ?, now(), now())""", id, nickname, profileCompleted);
		return id;
	}

	private void insertActiveMember(UUID tripId, UUID userId, long joinOrder) {
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at)
				values (?, ?, ?, 'ACTIVE', ?, now())""", UUID.randomUUID(), tripId, userId, joinOrder);
		jdbcTemplate.update("""
				insert into chat_participants (room_id, user_id, joined_at)
				select id, ?, now() from chat_rooms where trip_id = ?""", userId, tripId);
	}

	private long count(String sql, Object... args) {
		return jdbcTemplate.queryForObject(sql, Long.class, args);
	}

	// 한 연결에서 받은 이벤트·ERROR 프레임·연결 종료를 모은다
	private static class Listener extends StompSessionHandlerAdapter {

		private final BlockingQueue<JsonNode> events = new LinkedBlockingQueue<>();
		private final BlockingQueue<StompError> errors = new LinkedBlockingQueue<>();
		private final BlockingQueue<Throwable> transportErrors = new LinkedBlockingQueue<>();
		private final List<String> unhandled = new CopyOnWriteArrayList<>();
		private StompSession session;

		void subscribeChat() {
			session.subscribe(WebSocketConfig.CHAT_SUBSCRIPTION, frames());
		}

		StompFrameHandler frames() {
			return new StompFrameHandler() {
				@Override
				public Type getPayloadType(StompHeaders headers) {
					return JsonNode.class;
				}

				@Override
				public void handleFrame(StompHeaders headers, Object payload) {
					events.add((JsonNode) payload);
				}
			};
		}

		JsonNode nextEvent() throws InterruptedException {
			JsonNode event = events.poll(WAIT_SECONDS, TimeUnit.SECONDS);
			assertThat(event).as("event within %ss", WAIT_SECONDS).isNotNull();
			return event;
		}

		// ERROR 프레임의 message 헤더와 본문 오류 코드가 같고, 서버가 연결을 닫는다
		void expectErrorAndClose(String code) throws InterruptedException {
			StompError error = errors.poll(WAIT_SECONDS, TimeUnit.SECONDS);
			assertThat(error).as("ERROR frame %s", code).isNotNull();
			assertThat(error.message()).isEqualTo(code);
			assertThat(error.body().get("error").get("code").asString()).isEqualTo(code);
			assertThat(error.body().get("error").get("traceId").asString()).isNotBlank();
			assertThat(transportErrors.poll(WAIT_SECONDS, TimeUnit.SECONDS)).as("connection closed").isNotNull();
		}

		@Override
		public Type getPayloadType(StompHeaders headers) {
			return JsonNode.class;
		}

		@Override
		public void handleFrame(StompHeaders headers, Object payload) {
			errors.add(new StompError(headers.getFirst("message"), (JsonNode) payload));
		}

		@Override
		public void handleTransportError(StompSession session, Throwable exception) {
			transportErrors.add(exception);
		}

		@Override
		public void handleException(StompSession session, StompCommand command, StompHeaders headers, byte[] payload,
				Throwable exception) {
			unhandled.add(command + " " + headers + " " + exception);
		}

	}

	private record StompError(String message, JsonNode body) {
	}

}
