package com.eodilog.chat.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 실제 커밋과 동시 전송을 확인해야 하므로 테스트 트랜잭션을 쓰지 않는다. 테스트마다 새 사용자·여행으로 자료를 구분한다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ChatApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	private UUID ownerId;
	private UUID friendId;
	private UUID tripId;
	private UUID roomId;
	private UUID friendMemberId;

	@BeforeEach
	void setUp() throws Exception {
		ownerId = insertUser("방장");
		friendId = insertUser("동행");
		tripId = createTrip(ownerId, "제주");
		roomId = jdbcTemplate.queryForObject("select id from chat_rooms where trip_id = ?", UUID.class, tripId);
		friendMemberId = insertActiveMember(tripId, friendId, 2);
	}

	@Test
	void sendsAndListsMessagesNewestFirstBySequence() throws Exception {
		UUID clientId = UUID.randomUUID();
		send(ownerId, roomId, clientId, "  내일 9시에 만나요\n")
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.roomId").value(roomId.toString()))
				.andExpect(jsonPath("$.data.sequence").value(1))
				.andExpect(jsonPath("$.data.senderId").value(ownerId.toString()))
				.andExpect(jsonPath("$.data.type").value("TEXT"))
				.andExpect(jsonPath("$.data.text").value("  내일 9시에 만나요\n"))
				.andExpect(jsonPath("$.data.clientMessageId").value(clientId.toString()))
				.andExpect(jsonPath("$.data.eventId").isEmpty())
				.andExpect(jsonPath("$.data.target").isEmpty())
				.andExpect(jsonPath("$.data.eventReadAt").isEmpty())
				.andExpect(jsonPath("$.data.deletedAt").isEmpty());
		send(friendId, roomId, UUID.randomUUID(), "좋아요").andExpect(jsonPath("$.data.sequence").value(2));
		send(ownerId, roomId, UUID.randomUUID(), "우산 챙겨요").andExpect(jsonPath("$.data.sequence").value(3));

		messages(friendId, roomId, "limit=2")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[*].sequence").value(contains(3, 2)))
				.andExpect(jsonPath("$.page.nextBeforeSequence").value(2))
				.andExpect(jsonPath("$.page.hasNext").value(true))
				.andExpect(jsonPath("$.page.nextCursor").doesNotExist());
		messages(friendId, roomId, "limit=2&beforeSequence=2")
				.andExpect(jsonPath("$.data[*].sequence").value(contains(1)))
				.andExpect(jsonPath("$.page.nextBeforeSequence").isEmpty())
				.andExpect(jsonPath("$.page.hasNext").value(false));
	}

	@Test
	void resendsConcurrentlyOnceAndRejectsSameIdInAnotherRoom() throws Exception {
		// 같은 방 동시 재전송은 한 건만 저장하고, 다른 방에 같은 ID를 동시에 보내면 하나는 409(500이 아님)
		UUID otherRoomId = jdbcTemplate.queryForObject("select id from chat_rooms where trip_id = ?", UUID.class,
				createTrip(ownerId, "부산"));
		UUID sameRoomId = UUID.randomUUID();
		UUID crossRoomId = UUID.randomUUID();
		List<UUID[]> requests = List.of(
				new UUID[] {roomId, sameRoomId}, new UUID[] {roomId, sameRoomId}, new UUID[] {roomId, sameRoomId},
				new UUID[] {roomId, crossRoomId}, new UUID[] {otherRoomId, crossRoomId});
		CountDownLatch ready = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(requests.size());
		List<Future<MockHttpServletResponse>> futures = new ArrayList<>();
		try {
			for (UUID[] request : requests) {
				futures.add(executor.submit(() -> {
					ready.await();
					return send(ownerId, request[0], request[1], "동시").andReturn().getResponse();
				}));
			}
			ready.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (Future<MockHttpServletResponse> future : futures) {
				statuses.add(future.get().getStatus());
			}
			assertThat(statuses.subList(0, 3)).containsOnly(201);
			assertThat(statuses.subList(3, 5)).containsExactlyInAnyOrder(201, 409);
		} finally {
			executor.shutdownNow();
		}
		assertThat(count("select count(*) from messages where client_message_id = ?", sameRoomId)).isEqualTo(1);
		assertThat(count("select count(*) from messages where client_message_id = ?", crossRoomId)).isEqualTo(1);
	}

	@Test
	void resendsSameClientMessageIdOnce() throws Exception {
		UUID clientId = UUID.randomUUID();
		JsonNode first = data(send(ownerId, roomId, clientId, "안녕").andExpect(status().isCreated()));

		JsonNode second = data(send(ownerId, roomId, clientId, "안녕").andExpect(status().isCreated()));
		assertThat(second).isEqualTo(first);
		assertThat(count("select count(*) from messages where room_id = ?", roomId)).isEqualTo(1);
		send(ownerId, roomId, UUID.randomUUID(), "다음").andExpect(jsonPath("$.data.sequence").value(2));

		send(ownerId, roomId, clientId, "다른 본문")
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("CLIENT_MESSAGE_ID_REUSED"));
		UUID otherRoomId = jdbcTemplate.queryForObject("select id from chat_rooms where trip_id = ?", UUID.class,
				createTrip(ownerId, "부산"));
		send(ownerId, otherRoomId, clientId, "안녕")
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("CLIENT_MESSAGE_ID_REUSED"));
		// 다른 사람은 같은 clientMessageId를 써도 된다
		send(friendId, roomId, clientId, "안녕").andExpect(status().isCreated());
	}

	@Test
	void validatesMessageBody() throws Exception {
		mockMvc.perform(post("/api/v1/chat/rooms/{roomId}/messages", roomId).with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"text\":\"   \"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[*].field").value(
						containsInAnyOrder("clientMessageId", "text")));
		send(ownerId, roomId, UUID.randomUUID(), "가".repeat(1001))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("text"));
		send(ownerId, roomId, UUID.randomUUID(), "가".repeat(1000)).andExpect(status().isCreated());
		// 글자 수는 코드 포인트로 센다. 이모지 1,000개는 UTF-16으로 2,000이지만 통과한다
		send(ownerId, roomId, UUID.randomUUID(), "😀".repeat(1000)).andExpect(status().isCreated());
		send(ownerId, roomId, UUID.randomUUID(), "😀".repeat(1001)).andExpect(status().isBadRequest());
		send(ownerId, roomId, UUID.randomUUID(), "안녕" + (char) 0 + "하세요")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("text"));
		// 비참여자도 입력 오류가 먼저다
		send(insertUser("모르는 사람"), roomId, UUID.randomUUID(), " ").andExpect(status().isBadRequest());
	}

	@Test
	void newAndRejoinedMembersSeeWholeHistory() throws Exception {
		send(ownerId, roomId, UUID.randomUUID(), "첫 메시지");
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where id = ?", friendMemberId);
		jdbcTemplate.update("update chat_participants set left_at = now() where room_id = ? and user_id = ?", roomId, friendId);
		send(ownerId, roomId, UUID.randomUUID(), "동행이 나가 있는 동안");

		// 초대 수락으로 다시 들어온 동행과 새로 들어온 사람 모두 처음부터 본다
		String token = data(mockMvc.perform(post("/api/v1/trips/{tripId}/invitations", tripId).with(authUser(ownerId))))
				.get("token").asString();
		UUID newcomerId = insertUser("새 동행");
		for (UUID userId : List.of(friendId, newcomerId)) {
			mockMvc.perform(post("/api/v1/invitations/{token}/accept", token).with(authUser(userId)))
					.andExpect(status().isOk());
			messages(userId, roomId, "")
					.andExpect(status().isOk())
					.andExpect(jsonPath("$.data[*].text").value(contains("동행이 나가 있는 동안", "첫 메시지")));
		}
	}

	@Test
	void hidesRoomFromLeftRemovedAndNonMembers() throws Exception {
		send(ownerId, roomId, UUID.randomUUID(), "안녕");
		UUID friendClientId = UUID.randomUUID();
		send(friendId, roomId, friendClientId, "나가기 전").andExpect(status().isCreated());
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where id = ?", friendMemberId);
		expectRoomNotFound(messages(friendId, roomId, ""));
		expectRoomNotFound(send(friendId, roomId, UUID.randomUUID(), "몰래"));
		// 나간 뒤에는 같은 clientMessageId로 재전송해도 처음 메시지를 받을 수 없다
		expectRoomNotFound(send(friendId, roomId, friendClientId, "나가기 전"));
		mockMvc.perform(get("/api/v1/trips/{tripId}/chat-room", tripId).with(authUser(friendId)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));

		UUID removedId = insertUser("내보낸 동행");
		UUID removedMemberId = insertActiveMember(tripId, removedId, 3);
		jdbcTemplate.update("update trip_members set status = 'REMOVED', left_at = now() where id = ?", removedMemberId);
		expectRoomNotFound(messages(removedId, roomId, ""));
		expectRoomNotFound(send(removedId, roomId, UUID.randomUUID(), "몰래"));

		UUID strangerId = insertUser("모르는 사람");
		expectRoomNotFound(messages(strangerId, roomId, ""));
		expectRoomNotFound(messages(ownerId, UUID.randomUUID(), ""));
		mockMvc.perform(get("/api/v1/trips/{tripId}/chat-room", tripId).with(authUser(strangerId)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));

		jdbcTemplate.update("update trips set deleted_at = now() where id = ?", tripId);
		expectRoomNotFound(messages(ownerId, roomId, ""));
		expectRoomNotFound(send(ownerId, roomId, UUID.randomUUID(), "삭제된 여행"));
		assertThat(count("select count(*) from messages where room_id = ?", roomId)).isEqualTo(2);
		// 삭제된 여행의 방은 방 목록에서도 빠진다
		mockMvc.perform(get("/api/v1/chat/rooms").with(authUser(ownerId)))
				.andExpect(jsonPath("$.data", hasSize(0)));
	}

	@Test
	void showsTripRoomAndOnlyAccessibleRooms() throws Exception {
		mockMvc.perform(get("/api/v1/trips/{tripId}/chat-room", tripId).with(authUser(friendId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.id").value(roomId.toString()))
				.andExpect(jsonPath("$.data.type").value("TRIP"))
				.andExpect(jsonPath("$.data.tripId").value(tripId.toString()))
				.andExpect(jsonPath("$.data.participants[*].id").value(contains(ownerId.toString(), friendId.toString())))
				.andExpect(jsonPath("$.data.lastMessage").isEmpty());
		send(friendId, roomId, UUID.randomUUID(), "첫 메시지");
		send(ownerId, roomId, UUID.randomUUID(), "두 번째");

		UUID secondTripId = createTrip(ownerId, "부산");
		UUID leftTripId = createTrip(friendId, "강릉");
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where trip_id = ? and user_id = ?",
				leftTripId, friendId);
		insertActiveMember(secondTripId, friendId, 2);

		JsonNode firstPage = body(mockMvc.perform(get("/api/v1/chat/rooms").with(authUser(friendId)).param("limit", "1"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[0].tripId").value(secondTripId.toString()))
				.andExpect(jsonPath("$.page.hasNext").value(true)));
		mockMvc.perform(get("/api/v1/chat/rooms").with(authUser(friendId))
						.param("limit", "1").param("cursor", firstPage.get("page").get("nextCursor").asString()))
				.andExpect(jsonPath("$.data", hasSize(1)))
				.andExpect(jsonPath("$.data[0].id").value(roomId.toString()))
				.andExpect(jsonPath("$.data[0].lastMessage.text").value("두 번째"))
				.andExpect(jsonPath("$.data[0].lastMessage.sequence").value(2))
				.andExpect(jsonPath("$.page.hasNext").value(false));
	}

	@Test
	void givesGaplessSequencesToConcurrentSends() throws Exception {
		List<UUID> senders = List.of(ownerId, friendId, ownerId, friendId, ownerId);
		CountDownLatch ready = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(senders.size());
		List<Future<MockHttpServletResponse>> futures = new ArrayList<>();
		try {
			for (UUID sender : senders) {
				futures.add(executor.submit(() -> {
					ready.await();
					return send(sender, roomId, UUID.randomUUID(), "동시").andReturn().getResponse();
				}));
			}
			ready.countDown();
			for (Future<MockHttpServletResponse> future : futures) {
				assertThat(future.get().getStatus()).isEqualTo(201);
			}
		} finally {
			executor.shutdownNow();
		}
		assertThat(jdbcTemplate.queryForList("select sequence from messages where room_id = ? order by sequence",
				Long.class, roomId)).containsExactly(1L, 2L, 3L, 4L, 5L);
		assertThat(count("select next_sequence from chat_rooms where id = ?", roomId)).isEqualTo(6);
	}

	@Test
	void validatesPagingParameters() throws Exception {
		for (String query : List.of("limit=0", "limit=101", "beforeSequence=0", "beforeSequence=abc")) {
			messages(ownerId, roomId, query).andExpect(status().isBadRequest());
		}
		// 메시지 목록은 sequence 전용이라 공통 cursor와 섞으면 400
		messages(ownerId, roomId, "cursor=abc&beforeSequence=3")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("cursor"));
		mockMvc.perform(get("/api/v1/chat/rooms").with(authUser(ownerId)).param("limit", "101"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("limit"));
	}

	@Test
	void documentsChatApis() throws Exception {
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/chat/rooms'].get.tags[0]").value("채팅"))
				.andExpect(jsonPath("$.paths['/api/v1/chat/rooms/{roomId}/messages'].post.responses['201']").exists())
				.andExpect(jsonPath("$.paths['/api/v1/chat/rooms/{roomId}/messages'].post.responses['409'].description")
						.value(containsString("CLIENT_MESSAGE_ID_REUSED")))
				.andExpect(jsonPath("$.paths['/api/v1/chat/rooms/{roomId}/messages'].get.responses['404'].description")
						.value(containsString("CHAT_ROOM_NOT_FOUND")))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/chat-room'].get").exists());
	}

	private void expectRoomNotFound(ResultActions result) throws Exception {
		result.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("CHAT_ROOM_NOT_FOUND"));
	}

	private ResultActions send(UUID userId, UUID room, UUID clientMessageId, String text) throws Exception {
		return mockMvc.perform(post("/api/v1/chat/rooms/{roomId}/messages", room).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content(jsonMapper.writeValueAsString(Map.of("clientMessageId", clientMessageId, "text", text))));
	}

	private ResultActions messages(UUID userId, UUID room, String query) throws Exception {
		return mockMvc.perform(get("/api/v1/chat/rooms/" + room + "/messages?" + query).with(authUser(userId)));
	}

	private UUID createTrip(UUID userId, String title) throws Exception {
		return UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(userId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"title\":\"" + title + "\"}"))
				.andExpect(status().isCreated())).get("id").asString());
	}

	private JsonNode body(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString());
	}

	private JsonNode data(ResultActions result) throws Exception {
		return body(result).get("data");
	}

	private long count(String sql, Object... args) {
		return jdbcTemplate.queryForObject(sql, Long.class, args);
	}

	private UUID insertUser(String nickname) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, ?, true, now(), now())""", id, nickname);
		return id;
	}

	// 실제 참여(초대 수락)처럼 멤버십과 채팅 참여를 함께 넣는다
	private UUID insertActiveMember(UUID trip, UUID userId, long joinOrder) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at)
				values (?, ?, ?, 'ACTIVE', ?, now())""", id, trip, userId, joinOrder);
		jdbcTemplate.update("""
				insert into chat_participants (room_id, user_id, joined_at)
				select id, ?, now() from chat_rooms where trip_id = ?""", userId, trip);
		return id;
	}

}
