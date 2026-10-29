package com.eodilog.trip.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
import java.util.ArrayList;
import java.util.List;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 실제 커밋과 동시 변경을 확인해야 하므로 테스트 트랜잭션을 쓰지 않는다. 테스트마다 새 사용자·여행으로 자료를 구분한다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class TripMemberApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	private UUID ownerId;
	private UUID friendId;
	private UUID tripId;
	private UUID ownerMemberId;
	private UUID friendMemberId;

	@BeforeEach
	void setUp() throws Exception {
		ownerId = insertUser("방장");
		friendId = insertUser("동행");
		tripId = createTrip(ownerId);
		ownerMemberId = memberId(tripId, ownerId);
		friendMemberId = insertActiveMember(tripId, friendId, 2);
	}

	@Test
	void listsActiveMembersInJoinOrderAndInactiveOnlyOnRequest() throws Exception {
		UUID leaverId = insertUser("나간 동행");
		insertLeftMember(tripId, leaverId, 3);

		getMembers(friendId, tripId, null)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.members", hasSize(2)))
				.andExpect(jsonPath("$.data.members[0].id").value(ownerMemberId.toString()))
				.andExpect(jsonPath("$.data.members[0].role").value("OWNER"))
				.andExpect(jsonPath("$.data.members[0].user.nickname").value("방장"))
				.andExpect(jsonPath("$.data.members[1].id").value(friendMemberId.toString()))
				.andExpect(jsonPath("$.data.members[1].role").value("MEMBER"))
				.andExpect(jsonPath("$.data.members[1].status").value("ACTIVE"))
				.andExpect(jsonPath("$.data.members[1].leftAt").isEmpty());

		getMembers(friendId, tripId, true)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.members", hasSize(3)))
				.andExpect(jsonPath("$.data.members[2].user.nickname").value("나간 동행"))
				.andExpect(jsonPath("$.data.members[2].status").value("LEFT"))
				.andExpect(jsonPath("$.data.members[2].leftAt").isNotEmpty());

		// 공개 회원 정보 외의 개인정보는 담지 않는다
		JsonNode user = data(getMembers(ownerId, tripId, null)).get("members").get(0).get("user");
		assertThat(user.propertyNames()).containsExactlyInAnyOrder("id", "nickname", "profileImageUrl",
				"accountVisibility", "followingStatus", "followedByStatus");
	}

	@Test
	void hidesMembersFromOutsiders() throws Exception {
		UUID leaverId = insertUser("나간 동행");
		UUID strangerId = insertUser("모르는 사람");
		insertLeftMember(tripId, leaverId, 3);

		expectTripNotFound(getMembers(leaverId, tripId, true));
		expectTripNotFound(getMembers(strangerId, tripId, true));
		expectTripNotFound(getMembers(ownerId, UUID.randomUUID(), null));
	}

	@Test
	void transfersOwnershipToActiveMember() throws Exception {
		transferOwner(ownerId, tripId, friendMemberId, 1)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.ownerMemberId").value(friendMemberId.toString()))
				.andExpect(jsonPath("$.data.members[0].role").value("MEMBER"))
				.andExpect(jsonPath("$.data.members[1].role").value("OWNER"))
				.andExpect(jsonPath("$.data.version").value(2));
		assertThat(jdbcTemplate.queryForObject("select owner_user_id from trips where id = ?", UUID.class, tripId))
				.isEqualTo(friendId);

		// 넘긴 뒤에는 새 방장만 관리한다. 이전 화면 기준(version 1)의 정보 수정도 막힌다
		expectForbidden(transferOwner(ownerId, tripId, ownerMemberId, 2));
		expectForbidden(removeMember(ownerId, tripId, friendMemberId, 2L));
		mockMvc.perform(patch("/api/v1/trips/{tripId}", tripId).with(authUser(ownerId)).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"expectedVersion\":1,\"title\":\"x\"}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
		transferOwner(friendId, tripId, ownerMemberId, 2)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.ownerMemberId").value(ownerMemberId.toString()))
				.andExpect(jsonPath("$.data.version").value(3));
	}

	@Test
	void rejectsInvalidTransfers() throws Exception {
		UUID leaverId = insertUser("나간 동행");
		UUID leaverMemberId = insertLeftMember(tripId, leaverId, 3);
		UUID otherTripMemberId = memberId(createTrip(friendId), friendId);

		expectValidationError(postTransfer(ownerId, tripId, "{}"), "expectedVersion", "targetMemberId");
		expectValidationError(transferOwner(ownerId, tripId, ownerMemberId, 1), "targetMemberId");
		expectValidationError(transferOwner(ownerId, tripId, leaverMemberId, 1), "targetMemberId");
		expectValidationError(transferOwner(ownerId, tripId, otherTripMemberId, 1), "targetMemberId");
		expectValidationError(transferOwner(ownerId, tripId, UUID.randomUUID(), 1), "targetMemberId");
		expectValidationError(postTransfer(ownerId, tripId,
				"{\"targetMemberId\":\"%s\",\"expectedVersion\":1,\"ownerUserId\":\"%s\"}".formatted(friendMemberId, friendId)),
				"ownerUserId");

		expectForbidden(transferOwner(friendId, tripId, friendMemberId, 1));
		expectTripNotFound(transferOwner(leaverId, tripId, friendMemberId, 1));
		transferOwner(ownerId, tripId, friendMemberId, 0)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
		assertThat(version(tripId)).isEqualTo(1);
		assertThat(jdbcTemplate.queryForObject("select owner_user_id from trips where id = ?", UUID.class, tripId))
				.isEqualTo(ownerId);
	}

	@Test
	void removesMemberAndEndsChatParticipation() throws Exception {
		removeMember(ownerId, tripId, friendMemberId, 1L).andExpect(status().isNoContent());

		assertThat(jdbcTemplate.queryForObject("select status from trip_members where id = ?", String.class,
				friendMemberId)).isEqualTo("REMOVED");
		assertThat(count("select count(*) from trip_members where id = ? and left_at is not null", friendMemberId))
				.isEqualTo(1);
		assertThat(count("""
				select count(*) from chat_participants p join chat_rooms r on r.id = p.room_id
				where r.trip_id = ? and p.user_id = ? and p.left_at is not null""", tripId, friendId)).isEqualTo(1);
		assertThat(count("""
				select count(*) from chat_participants p join chat_rooms r on r.id = p.room_id
				where r.trip_id = ? and p.user_id = ? and p.left_at is null""", tripId, ownerId)).isEqualTo(1);
		assertThat(version(tripId)).isEqualTo(2);

		// 내보낸 동행은 여행 내부 자료에 바로 접근할 수 없다
		expectTripNotFound(mockMvc.perform(get("/api/v1/trips/{tripId}", tripId).with(authUser(friendId))));
		expectTripNotFound(getMembers(friendId, tripId, null));
		getMembers(ownerId, tripId, null).andExpect(jsonPath("$.data.members", hasSize(1)));
		getMembers(ownerId, tripId, true)
				.andExpect(jsonPath("$.data.members", hasSize(2)))
				.andExpect(jsonPath("$.data.members[1].status").value("REMOVED"));
	}

	@Test
	void rejectsInvalidRemovals() throws Exception {
		UUID leaverId = insertUser("나간 동행");
		UUID leaverMemberId = insertLeftMember(tripId, leaverId, 3);
		UUID otherTripMemberId = memberId(createTrip(friendId), friendId);

		expectValidationError(removeMember(ownerId, tripId, friendMemberId, null), "expectedVersion");
		expectValidationError(removeMember(ownerId, tripId, ownerMemberId, 1L), "memberId");
		expectMemberNotFound(removeMember(ownerId, tripId, leaverMemberId, 1L));
		expectMemberNotFound(removeMember(ownerId, tripId, otherTripMemberId, 1L));
		expectMemberNotFound(removeMember(ownerId, tripId, UUID.randomUUID(), 1L));

		expectForbidden(removeMember(friendId, tripId, ownerMemberId, 1L));
		expectTripNotFound(removeMember(leaverId, tripId, friendMemberId, 1L));
		removeMember(ownerId, tripId, friendMemberId, 0L)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
		assertThat(version(tripId)).isEqualTo(1);
		assertThat(jdbcTemplate.queryForObject("select status from trip_members where id = ?", String.class,
				friendMemberId)).isEqualTo("ACTIVE");

		removeMember(ownerId, tripId, friendMemberId, 1L).andExpect(status().isNoContent());
		expectMemberNotFound(removeMember(ownerId, tripId, friendMemberId, 2L));
	}

	@Test
	void letsOnlyOneConcurrentChangeWithSameVersionSucceed() throws Exception {
		UUID secondId = insertUser("두 번째 동행");
		UUID secondMemberId = insertActiveMember(tripId, secondId, 3);
		CountDownLatch ready = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(2);
		List<Future<Integer>> futures = new ArrayList<>();
		try {
			// 같은 version을 보고 두 동행을 동시에 내보낸다. 여행 행 잠금으로 순서가 정해져 하나만 반영되어야 한다
			for (UUID memberId : List.of(friendMemberId, secondMemberId)) {
				futures.add(executor.submit(() -> {
					ready.await();
					return removeMember(ownerId, tripId, memberId, 1L).andReturn().getResponse().getStatus();
				}));
			}
			ready.countDown();

			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> future : futures) {
				statuses.add(future.get());
			}
			assertThat(statuses).containsExactlyInAnyOrder(204, 409);
			assertThat(version(tripId)).isEqualTo(2);
			assertThat(count("select count(*) from trip_members where trip_id = ? and status = 'REMOVED'", tripId))
					.isEqualTo(1);
		} finally {
			executor.shutdownNow();
		}
	}

	@Test
	void documentsMemberApi() throws Exception {
		JsonNode docs = jsonMapper.readTree(mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/members'].get.tags[0]").value("여행"))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/owner-transfer'].post.responses['403'].description")
						.value(containsString("FORBIDDEN")))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/owner-transfer'].post.responses['409'].description")
						.value(containsString("VERSION_CONFLICT")))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/members/{memberId}'].delete.responses['204']").exists())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/members/{memberId}'].delete.responses['404'].description")
						.value(containsString("MEMBER_NOT_FOUND")))
				.andReturn().getResponse().getContentAsString());

		assertThat(docs.get("components").get("schemas").get("OwnerTransferRequest").get("properties").propertyNames())
				.containsExactlyInAnyOrder("targetMemberId", "expectedVersion");
	}

	private void expectValidationError(ResultActions result, String... fields) throws Exception {
		result.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields", hasSize(fields.length)));
		for (int i = 0; i < fields.length; i++) {
			result.andExpect(jsonPath("$.error.fields[%d].field".formatted(i)).value(fields[i]));
		}
	}

	private void expectForbidden(ResultActions result) throws Exception {
		result.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
	}

	private void expectTripNotFound(ResultActions result) throws Exception {
		result.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
	}

	private void expectMemberNotFound(ResultActions result) throws Exception {
		result.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("MEMBER_NOT_FOUND"));
	}

	private UUID createTrip(UUID userId) throws Exception {
		return UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(userId)).with(csrf())
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"title\":\"제주\"}"))
				.andExpect(status().isCreated())).get("id").asString());
	}

	private ResultActions getMembers(UUID userId, UUID tripId, Boolean includeInactive) throws Exception {
		var request = get("/api/v1/trips/{tripId}/members", tripId).with(authUser(userId));
		if (includeInactive != null) {
			request.param("includeInactive", includeInactive.toString());
		}
		return mockMvc.perform(request);
	}

	private ResultActions transferOwner(UUID userId, UUID tripId, UUID targetMemberId, long expectedVersion)
			throws Exception {
		return postTransfer(userId, tripId,
				"{\"targetMemberId\":\"%s\",\"expectedVersion\":%d}".formatted(targetMemberId, expectedVersion));
	}

	private ResultActions postTransfer(UUID userId, UUID tripId, String body) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/owner-transfer", tripId).with(authUser(userId)).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(body));
	}

	private ResultActions removeMember(UUID userId, UUID tripId, UUID memberId, Long expectedVersion)
			throws Exception {
		var request = delete("/api/v1/trips/{tripId}/members/{memberId}", tripId, memberId)
				.with(authUser(userId)).with(csrf());
		if (expectedVersion != null) {
			request.param("expectedVersion", expectedVersion.toString());
		}
		return mockMvc.perform(request);
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

	private UUID memberId(UUID tripId, UUID userId) {
		return jdbcTemplate.queryForObject("select id from trip_members where trip_id = ? and user_id = ?",
				UUID.class, tripId, userId);
	}

	private long version(UUID tripId) {
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
	private UUID insertActiveMember(UUID tripId, UUID userId, long joinOrder) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at)
				values (?, ?, ?, 'ACTIVE', ?, now())""", id, tripId, userId, joinOrder);
		jdbcTemplate.update("""
				insert into chat_participants (room_id, user_id, joined_at)
				select id, ?, now() from chat_rooms where trip_id = ?""", userId, tripId);
		return id;
	}

	private UUID insertLeftMember(UUID tripId, UUID userId, long joinOrder) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at, left_at)
				values (?, ?, ?, 'LEFT', ?, now(), now())""", id, tripId, userId, joinOrder);
		return id;
	}

}
