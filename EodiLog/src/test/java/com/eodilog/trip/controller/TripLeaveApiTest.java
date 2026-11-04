package com.eodilog.trip.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.job.JobWorker;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.LockSupport;
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

// 실제 커밋과 동시 나가기를 확인해야 하므로 테스트 트랜잭션을 쓰지 않는다. 테스트마다 새 사용자·여행으로 자료를 구분한다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class TripLeaveApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	@Autowired
	private JobWorker worker;

	private UUID ownerId;
	private UUID friendId;
	private UUID tripId;
	private UUID ownerMemberId;
	private UUID friendMemberId;

	@BeforeEach
	void setUp() throws Exception {
		ownerId = insertUser("방장");
		friendId = insertUser("동행");
		tripId = UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(ownerId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"title\":\"제주\"}"))
				.andExpect(status().isCreated())).get("id").asString());
		ownerMemberId = memberId(ownerId);
		friendMemberId = insertActiveMember(friendId, 2);
	}

	@Test
	void memberLeavesKeepingExpensesAndMessages() throws Exception {
		UUID roomId = jdbcTemplate.queryForObject("select id from chat_rooms where trip_id = ?", UUID.class, tripId);
		mockMvc.perform(post("/api/v1/chat/rooms/{roomId}/messages", roomId).with(authUser(friendId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"clientMessageId\":\"" + UUID.randomUUID() + "\",\"text\":\"먼저 갈게요\"}"))
				.andExpect(status().isCreated());
		mockMvc.perform(post("/api/v1/trips/{tripId}/expenses", tripId).with(authUser(friendId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"title":"저녁","amountMinor":20000,"currency":"KRW","payerMemberId":"%s",
								 "participantMemberIds":["%s","%s"],"spentAt":"2026-11-01T11:30:00Z"}
								""".formatted(friendMemberId, ownerMemberId, friendMemberId)))
				.andExpect(status().isCreated());

		leave(friendId, false, false, 1)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.tripId").value(tripId.toString()))
				.andExpect(jsonPath("$.data.tripDeleted").value(false))
				.andExpect(jsonPath("$.data.newOwnerMemberId").isEmpty())
				.andExpect(jsonPath("$.data.cleanupJobId").isEmpty())
				.andExpect(jsonPath("$.data.status").value("LEFT"));

		assertThat(count("select count(*) from trip_members where id = ? and status = 'LEFT' and left_at is not null",
				friendMemberId)).isEqualTo(1);
		assertThat(count("""
				select count(*) from chat_participants p join chat_rooms r on r.id = p.room_id
				where r.trip_id = ? and p.user_id = ? and p.left_at is not null""", tripId, friendId)).isEqualTo(1);
		assertThat(version()).isEqualTo(2);
		// 경비는 남고 나간 멤버는 과거 결제자로 보인다
		assertThat(count("select count(*) from expenses where trip_id = ? and deleted_at is null", tripId)).isEqualTo(1);
		mockMvc.perform(get("/api/v1/trips/{tripId}", tripId).with(authUser(ownerId)))
				.andExpect(jsonPath("$.data.members", hasSize(1)))
				.andExpect(jsonPath("$.data.ownerMemberId").value(ownerMemberId.toString()));
		// 메시지는 남고, 남은 멤버에게 그대로 보인다
		mockMvc.perform(get("/api/v1/chat/rooms/{roomId}/messages", roomId).with(authUser(ownerId)))
				.andExpect(jsonPath("$.data[0].text").value("먼저 갈게요"))
				.andExpect(jsonPath("$.data[0].senderId").value(friendId.toString()));
		// 나간 사람은 여행·채팅에 들어갈 수 없고, 같은 요청을 다시 보내면 404
		mockMvc.perform(get("/api/v1/trips/{tripId}", tripId).with(authUser(friendId))).andExpect(status().isNotFound());
		mockMvc.perform(get("/api/v1/chat/rooms/{roomId}/messages", roomId).with(authUser(friendId)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("CHAT_ROOM_NOT_FOUND"));
		expectTripNotFound(leave(friendId, false, false, 2));
	}

	@Test
	void memberLeavesDeletingOwnMessageBodiesThroughJob() throws Exception {
		UUID roomId = roomId();
		UUID firstClientId = UUID.randomUUID();
		sendMessage(friendId, roomId, firstClientId, "먼저 갈게요");
		sendMessage(ownerId, roomId, UUID.randomUUID(), "잘 가요");
		sendMessage(friendId, roomId, UUID.randomUUID(), "다음에 봐요");

		// 지울 메시지가 있으면 LEAVE_CLEANUP 작업을 접수하고 202. 나가기 자체는 바로 끝난다(LEFT)
		JsonNode result = data(leave(friendId, false, true, 1)
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.data.tripDeleted").value(false))
				.andExpect(jsonPath("$.data.status").value("LEFT"))
				.andExpect(jsonPath("$.data.newOwnerMemberId").isEmpty())
				.andExpect(jsonPath("$.data.cleanupJobId").isNotEmpty()));
		UUID jobId = UUID.fromString(result.get("cleanupJobId").asString());
		assertThat(count("select count(*) from trip_members where id = ? and status = 'LEFT'", friendMemberId)).isEqualTo(1);
		assertThat(version()).isEqualTo(2);
		assertThat(jdbcTemplate.queryForObject("select kind || ':' || status from jobs where id = ?", String.class, jobId))
				.isEqualTo("LEAVE_CLEANUP:QUEUED");

		runJob(jobId);

		// 나간 사람의 메시지는 자리(순번)는 남고 본문만 지워진다. 다른 사람 메시지는 그대로다
		mockMvc.perform(get("/api/v1/chat/rooms/{roomId}/messages", roomId).with(authUser(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data", hasSize(3)))
				.andExpect(jsonPath("$.data[0].sequence").value(3))
				.andExpect(jsonPath("$.data[0].senderId").value(friendId.toString()))
				.andExpect(jsonPath("$.data[0].text").isEmpty())
				.andExpect(jsonPath("$.data[0].deletedAt").isNotEmpty())
				.andExpect(jsonPath("$.data[1].text").value("잘 가요"))
				.andExpect(jsonPath("$.data[1].deletedAt").isEmpty())
				.andExpect(jsonPath("$.data[2].text").isEmpty())
				.andExpect(jsonPath("$.data[2].deletedAt").isNotEmpty());
		// 작업은 요청한 사람만 나간 뒤에도 본다. 결과는 개수만
		mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(friendId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.kind").value("LEAVE_CLEANUP"))
				.andExpect(jsonPath("$.data.status").value("SUCCEEDED"))
				.andExpect(jsonPath("$.data.result.scope").value("LEAVE_CLEANUP"))
				.andExpect(jsonPath("$.data.result.completedCount").value(2))
				.andExpect(jsonPath("$.data.result.failedCount").value(0))
				.andExpect(jsonPath("$.data.result.messageIds").doesNotExist());
		mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(ownerId)))
				.andExpect(status().isNotFound());

		// 다시 들어와도 지운 메시지는 되살아나지 않고, 그 clientMessageId는 다시 쓸 수 없다
		String link = data(mockMvc.perform(post("/api/v1/trips/{tripId}/invitations", tripId).with(authUser(ownerId))))
				.get("token").asString();
		mockMvc.perform(post("/api/v1/invitations/{token}/accept", link).with(authUser(friendId)))
				.andExpect(status().isOk());
		mockMvc.perform(post("/api/v1/chat/rooms/{roomId}/messages", roomId).with(authUser(friendId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"clientMessageId\":\"" + firstClientId + "\",\"text\":\"먼저 갈게요\"}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("CLIENT_MESSAGE_ID_REUSED"));
		sendMessage(friendId, roomId, UUID.randomUUID(), "다시 왔어요");
		assertThat(count("select count(*) from messages where room_id = ? and deleted_at is null", roomId)).isEqualTo(2);
	}

	@Test
	void leavesWithoutJobWhenNoOwnMessagesToDelete() throws Exception {
		sendMessage(ownerId, roomId(), UUID.randomUUID(), "방장 메시지");

		// 지울 것이 없으면 가짜 작업을 만들지 않고 200
		leave(friendId, false, true, 1)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("LEFT"))
				.andExpect(jsonPath("$.data.cleanupJobId").isEmpty());
		assertThat(count("select count(*) from jobs where trip_id = ?", tripId)).isZero();
		assertThat(count("select count(*) from messages where room_id = ? and deleted_at is null", roomId())).isEqualTo(1);
	}

	@Test
	void loneMemberDeletingMessagesGetsOnlyTripDeletion() throws Exception {
		sendMessage(ownerId, roomId(), UUID.randomUUID(), "혼자 남았네");
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where id = ?", friendMemberId);

		// 여행 삭제가 메시지까지 지우므로 정리 작업을 따로 만들지 않는다
		leave(ownerId, false, true, 1)
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.data.status").value("TRIP_DELETED"));
		assertThat(jdbcTemplate.queryForList("select kind from jobs where trip_id = ?", String.class, tripId))
				.containsExactly("TRIP_DELETE");
	}

	@Test
	void ownerLeavesAndEarliestRemainingMemberBecomesOwner() throws Exception {
		// 셋째(참여 순 3)를 나중에 넣고, 먼저 넣은 동행은 재참여로 참여 순이 4가 된 상황.
		// 넣은 순서가 아니라 참여 순으로 고르면 셋째가 방장이 된다
		UUID thirdId = insertUser("셋째");
		UUID thirdMemberId = insertActiveMember(thirdId, 3);
		jdbcTemplate.update("update trip_members set join_order = 4 where id = ?", friendMemberId);

		leave(ownerId, false, false, 1)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.newOwnerMemberId").value(thirdMemberId.toString()))
				.andExpect(jsonPath("$.data.tripDeleted").value(false))
				.andExpect(jsonPath("$.data.cleanupJobId").isEmpty())
				.andExpect(jsonPath("$.data.status").value("LEFT"));

		// 방장 양도와 멤버 변경이 겹쳐도 version은 한 번만 오른다
		assertThat(version()).isEqualTo(2);
		assertThat(count("select count(*) from trip_members where id = ? and status = 'LEFT' and left_at is not null",
				ownerMemberId)).isEqualTo(1);
		assertThat(count("""
				select count(*) from chat_participants p join chat_rooms r on r.id = p.room_id
				where r.trip_id = ? and p.user_id = ? and p.left_at is not null""", tripId, ownerId)).isEqualTo(1);
		mockMvc.perform(get("/api/v1/trips/{tripId}", tripId).with(authUser(thirdId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.ownerMemberId").value(thirdMemberId.toString()))
				.andExpect(jsonPath("$.data.members", hasSize(2)));
		expectTripNotFound(mockMvc.perform(get("/api/v1/trips/{tripId}", tripId).with(authUser(ownerId))));
	}

	@Test
	void deletesTripWhenLoneMemberLeaves() throws Exception {
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where id = ?", friendMemberId);

		leave(ownerId, false, false, 0)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
		assertThat(version()).isEqualTo(1);

		// 혼자 남은 사람의 나가기는 여행 삭제 접수다(정책 §14 D-2): 202, TRIP_DELETED, TRIP_DELETE 작업 ID
		JsonNode result = data(leave(ownerId, false, false, 1)
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.data.tripId").value(tripId.toString()))
				.andExpect(jsonPath("$.data.tripDeleted").value(true))
				.andExpect(jsonPath("$.data.status").value("TRIP_DELETED"))
				.andExpect(jsonPath("$.data.newOwnerMemberId").isEmpty())
				.andExpect(jsonPath("$.data.cleanupJobId").isNotEmpty()));
		UUID jobId = UUID.fromString(result.get("cleanupJobId").asString());
		assertThat(count("select count(*) from trip_members where id = ? and status = 'LEFT'", ownerMemberId)).isEqualTo(1);
		assertThat(count("select count(*) from trips where id = ? and deleted_at is not null", tripId)).isEqualTo(1);
		assertThat(jdbcTemplate.queryForObject("select kind || ':' || status from jobs where id = ?", String.class, jobId))
				.isEqualTo("TRIP_DELETE:QUEUED");
		expectTripNotFound(mockMvc.perform(get("/api/v1/trips/{tripId}", tripId).with(authUser(ownerId))));
		expectTripNotFound(leave(ownerId, false, false, 2));
		// 요청한 사람만 작업을 볼 수 있다
		mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.kind").value("TRIP_DELETE"));
		mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(friendId)))
				.andExpect(status().isNotFound());
	}

	@Test
	void rejectsDeleteOptionsAndMissingFields() throws Exception {
		// 사진 삭제는 사진 기능 전이라 true를 성공으로 처리하지 않고 400. 메시지 삭제는 받는다
		leave(ownerId, true, true, 1)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields", hasSize(1)))
				.andExpect(jsonPath("$.error.fields[0].field").value("deleteOwnPhotos"));
		postLeave(friendId, "{}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[*].field").value(
						containsInAnyOrder("deleteOwnPhotos", "deleteOwnMessages", "expectedVersion")));
		postLeave(friendId, "{\"deleteOwnPhotos\":false,\"expectedVersion\":1}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields", hasSize(1)))
				.andExpect(jsonPath("$.error.fields[0].field").value("deleteOwnMessages"));
		postLeave(friendId, "{\"deleteOwnPhotos\":false,\"deleteOwnMessages\":false,\"expectedVersion\":1,\"reason\":\"x\"}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("reason"));
		mockMvc.perform(post("/api/v1/trips/{tripId}/leave", tripId).with(authUser(friendId))
						.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isBadRequest());
		// 입력 오류가 권한보다 먼저다
		leave(insertUser("모르는 사람"), true, false, 1).andExpect(status().isBadRequest());
		assertThat(count("select count(*) from trip_members where trip_id = ? and status = 'ACTIVE'", tripId))
				.isEqualTo(2);
	}

	@Test
	void rejectsStaleVersionAndNonMembers() throws Exception {
		leave(friendId, false, false, 0)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
		expectTripNotFound(leave(insertUser("모르는 사람"), false, false, 1));
		// 멤버 확인이 version 검사보다 먼저다
		expectTripNotFound(leave(insertUser("또 모르는 사람"), false, false, 0));
		UUID removedId = insertUser("내보낸 동행");
		UUID removedMemberId = insertActiveMember(removedId, 3);
		jdbcTemplate.update("update trip_members set status = 'REMOVED', left_at = now() where id = ?", removedMemberId);
		expectTripNotFound(leave(removedId, false, false, 1));
		assertThat(count("select count(*) from trip_members where trip_id = ? and status = 'ACTIVE'", tripId))
				.isEqualTo(2);
		assertThat(version()).isEqualTo(1);
	}

	@Test
	void invalidatesInvitationOfLeaverAndAllowsRejoin() throws Exception {
		String link = data(mockMvc.perform(post("/api/v1/trips/{tripId}/invitations", tripId).with(authUser(friendId))))
				.get("token").asString();
		leave(friendId, false, false, 1).andExpect(status().isOk());

		// 초대한 사람이 나갔으므로 그 링크는 410
		mockMvc.perform(post("/api/v1/invitations/{token}/accept", link).with(authUser(insertUser("손님"))))
				.andExpect(status().isGone())
				.andExpect(jsonPath("$.error.code").value("INVITATION_EXPIRED"));
		// 남은 방장이 새로 발급한 링크로 돌아올 수 있다
		String newLink = data(mockMvc.perform(post("/api/v1/trips/{tripId}/invitations", tripId).with(authUser(ownerId))))
				.get("token").asString();
		mockMvc.perform(post("/api/v1/invitations/{token}/accept", newLink).with(authUser(friendId)))
				.andExpect(status().isOk());
		assertThat(count("select count(*) from trip_members where id = ? and status = 'ACTIVE'", friendMemberId))
				.isEqualTo(1);
	}

	@Test
	void letsOnlyOneOfConcurrentLeavesWithSameVersionSucceed() throws Exception {
		insertActiveMember(insertUser("셋째"), 3);
		List<UUID> leavers = List.of(ownerId, friendId);
		CountDownLatch ready = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(leavers.size());
		List<Future<MockHttpServletResponse>> futures = new ArrayList<>();
		try {
			for (UUID leaver : leavers) {
				futures.add(executor.submit(() -> {
					ready.await();
					return leave(leaver, false, false, 1).andReturn().getResponse();
				}));
			}
			ready.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (Future<MockHttpServletResponse> future : futures) {
				MockHttpServletResponse response = future.get();
				statuses.add(response.getStatus());
				if (response.getStatus() == 409) {
					assertThat(response.getContentAsString()).contains("VERSION_CONFLICT");
				}
			}
			assertThat(statuses).containsExactlyInAnyOrder(200, 409);
		} finally {
			executor.shutdownNow();
		}
		assertThat(count("select count(*) from trip_members where trip_id = ? and status = 'ACTIVE'", tripId))
				.isEqualTo(2);
		assertThat(version()).isEqualTo(2);
	}

	@Test
	void documentsLeaveApi() throws Exception {
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/leave'].post.tags[0]").value("여행"))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/leave'].post.responses['200']").exists())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/leave'].post.responses['202']").exists())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/leave'].post.responses['409'].description")
						.value(containsString("VERSION_CONFLICT")));
	}

	private void expectTripNotFound(ResultActions result) throws Exception {
		result.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
	}

	private ResultActions leave(UUID userId, boolean deletePhotos, boolean deleteMessages, long expectedVersion)
			throws Exception {
		return postLeave(userId, """
				{"deleteOwnPhotos":%s,"deleteOwnMessages":%s,"expectedVersion":%d}
				""".formatted(deletePhotos, deleteMessages, expectedVersion));
	}

	private ResultActions postLeave(UUID userId, String body) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/leave", tripId).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content(body));
	}

	private UUID roomId() {
		return jdbcTemplate.queryForObject("select id from chat_rooms where trip_id = ?", UUID.class, tripId);
	}

	private void sendMessage(UUID userId, UUID roomId, UUID clientMessageId, String text) throws Exception {
		mockMvc.perform(post("/api/v1/chat/rooms/{roomId}/messages", roomId).with(authUser(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"clientMessageId\":\"" + clientMessageId + "\",\"text\":\"" + text + "\"}"))
				.andExpect(status().isCreated());
	}

	// 다른 테스트가 남긴 작업이 먼저 선점될 수 있으므로 내 작업이 QUEUED를 벗어날 때까지 선점을 반복한다
	private void runJob(UUID jobId) {
		long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
		while (jobState(jobId).equals("QUEUED") && System.nanoTime() < until) {
			if (!worker.pollOnce()) {
				LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(20));
			}
		}
		while (!jobState(jobId).equals("SUCCEEDED") && System.nanoTime() < until) {
			LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(5));
		}
		assertThat(jobState(jobId)).isEqualTo("SUCCEEDED");
	}

	private String jobState(UUID jobId) {
		return jdbcTemplate.queryForObject("select status from jobs where id = ?", String.class, jobId);
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

	private UUID memberId(UUID userId) {
		return jdbcTemplate.queryForObject("select id from trip_members where trip_id = ? and user_id = ?",
				UUID.class, tripId, userId);
	}

	private long version() {
		return jdbcTemplate.queryForObject("select version from trips where id = ?", Long.class, tripId);
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
	private UUID insertActiveMember(UUID userId, long joinOrder) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at)
				values (?, ?, ?, 'ACTIVE', ?, now())""", id, tripId, userId, joinOrder);
		jdbcTemplate.update("""
				insert into chat_participants (room_id, user_id, joined_at)
				select id, ?, now() from chat_rooms where trip_id = ?""", userId, tripId);
		return id;
	}

}
