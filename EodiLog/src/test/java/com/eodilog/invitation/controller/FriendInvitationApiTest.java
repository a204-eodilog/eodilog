package com.eodilog.invitation.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Collectors;
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

// 동시 수락을 확인해야 하므로 테스트 트랜잭션을 쓰지 않는다. 테스트마다 새 사용자·여행으로 자료를 구분한다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class FriendInvitationApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	private UUID ownerId;
	private UUID tripId;

	@BeforeEach
	void setUp() throws Exception {
		ownerId = insertUser("방장");
		tripId = UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(ownerId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"title\":\"부산\",\"startDate\":\"2026-12-01\",\"endDate\":\"2026-12-03\"}"))
				.andExpect(status().isCreated())).get("id").asString());
	}

	@Test
	void sendsToMutualFriendAndNotifiesWithoutTripId() throws Exception {
		UUID friendId = mutualFriend("민지");

		JsonNode result = data(send(ownerId, friendId).andExpect(status().isOk())).get("results").get(0);

		assertThat(result.get("userId").asString()).isEqualTo(friendId.toString());
		assertThat(result.get("result").asString()).isEqualTo("SENT");
		UUID invitationId = UUID.fromString(result.get("invitationId").asString());
		assertThat(count("""
				select count(*) from trip_friend_invitations
				where id = ? and status = 'PENDING' and expires_at - created_at = interval '7 days'""", invitationId))
				.isEqualTo(1);
		// 받는 사람은 아직 멤버가 아니므로 trip_id 없이 등록해야 알림이 생긴다
		assertThat(jdbcTemplate.queryForList("""
				select e.payload_json->>'message' from notifications n join events e on e.id = n.event_id
				where n.recipient_user_id = ? and e.type = 'TRIP_INVITED' and e.target_type = 'TRIP_INVITATION'
				  and e.target_id = ? and e.trip_id is null""", String.class, friendId, invitationId))
				.containsExactly("방장님이 '부산' 여행에 초대했어요.");
		mockMvc.perform(get("/api/v1/me/notifications").with(authUser(friendId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[0].kind").value("TRIP_INVITED"))
				.andExpect(jsonPath("$.data[0].target.type").value("TRIP_INVITATION"))
				.andExpect(jsonPath("$.data[0].target.id").value(invitationId.toString()));
	}

	@Test
	void sendsOnlyToMutualFollowers() throws Exception {
		UUID oneWay = insertUser("한쪽만");
		follow(ownerId, oneWay, "ACCEPTED");
		UUID requested = insertUser("요청 대기");
		follow(ownerId, requested, "ACCEPTED");
		follow(requested, ownerId, "REQUESTED");
		UUID mutual = mutualFriend("맞팔");

		JsonNode results = data(send(ownerId, oneWay, requested, UUID.randomUUID(), mutual)
				.andExpect(status().isOk())).get("results");

		assertThat(outcomes(results)).containsExactly("NOT_MUTUAL", "NOT_MUTUAL", "NOT_MUTUAL", "SENT");
		assertThat(count("select count(*) from trip_friend_invitations where trip_id = ?", tripId)).isEqualTo(1);
	}

	@Test
	void resendKeepsOnePendingInvitationAndNotifiesOnce() throws Exception {
		UUID friendId = mutualFriend("민지");
		UUID memberFriend = mutualFriend("동행");
		insertMember(memberFriend, 2, "ACTIVE");
		String first = invitationId(send(ownerId, friendId));

		JsonNode results = data(send(ownerId, friendId, friendId, memberFriend).andExpect(status().isOk()))
				.get("results");

		assertThat(outcomes(results)).containsExactly("ALREADY_INVITED", "ALREADY_MEMBER");
		assertThat(results.get(0).get("invitationId").asString()).isEqualTo(first);
		assertThat(count("select count(*) from trip_friend_invitations where trip_id = ?", tripId)).isEqualTo(1);
		assertThat(count("select count(*) from events where type = 'TRIP_INVITED' and target_id = ?::uuid", first))
				.isEqualTo(1);
	}

	@Test
	void rejectsBadRequestsAndNonMembers() throws Exception {
		UUID friendId = mutualFriend("민지");
		mockMvc.perform(post("/api/v1/trips/{tripId}/friend-invitations", tripId).with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON).content("{\"inviteeUserIds\":[]}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
		send(ownerId, friendId, ownerId)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
		UUID stranger = insertUser("모르는 사람");
		send(stranger, friendId)
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
		mockMvc.perform(get("/api/v1/trips/{tripId}/invitable-friends", tripId).with(authUser(stranger)))
				.andExpect(status().isNotFound());
		assertThat(count("select count(*) from trip_friend_invitations where trip_id = ?", tripId)).isZero();
	}

	@Test
	void rejectsSendingWhenTripIsFull() throws Exception {
		UUID friendId = mutualFriend("민지");
		fillTrip(20);

		send(ownerId, friendId)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("TRIP_FULL"));
	}

	@Test
	void listsMutualFriendsWithTripState() throws Exception {
		UUID member = mutualFriend("가 동행");
		insertMember(member, 2, "ACTIVE");
		UUID invited = mutualFriend("나 초대함");
		UUID free = mutualFriend("다 초대 가능");
		follow(ownerId, insertUser("한쪽만"), "ACCEPTED");
		String invitationId = invitationId(send(ownerId, invited));

		mockMvc.perform(get("/api/v1/trips/{tripId}/invitable-friends", tripId).with(authUser(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.friends", hasSize(3)))
				.andExpect(jsonPath("$.data.friends[0].user.id").value(free.toString()))
				.andExpect(jsonPath("$.data.friends[0].state").value("INVITABLE"))
				.andExpect(jsonPath("$.data.friends[0].invitationId").isEmpty())
				.andExpect(jsonPath("$.data.friends[1].user.id").value(invited.toString()))
				.andExpect(jsonPath("$.data.friends[1].state").value("INVITED"))
				.andExpect(jsonPath("$.data.friends[1].invitationId").value(invitationId))
				.andExpect(jsonPath("$.data.friends[2].user.id").value(member.toString()))
				.andExpect(jsonPath("$.data.friends[2].state").value("MEMBER"))
				.andExpect(jsonPath("$.data.activeMemberCount").value(2))
				.andExpect(jsonPath("$.data.capacity").value(20))
				.andExpect(jsonPath("$.data.truncated").value(false));
	}

	@Test
	void acceptJoinsTripLikeLinkInvitation() throws Exception {
		UUID friendId = mutualFriend("민지");
		String invitationId = invitationId(send(ownerId, friendId));
		mockMvc.perform(get("/api/v1/me/trip-invitations").with(authUser(friendId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data", hasSize(1)))
				.andExpect(jsonPath("$.data[0].id").value(invitationId))
				.andExpect(jsonPath("$.data[0].trip.title").value("부산"))
				.andExpect(jsonPath("$.data[0].trip.memberCount").value(1))
				.andExpect(jsonPath("$.data[0].inviter.nickname").value("방장"))
				.andExpect(jsonPath("$.data[0].status").value("PENDING"));

		accept(friendId, invitationId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.id").value(tripId.toString()))
				.andExpect(jsonPath("$.data.version").value(2));

		assertThat(count("select count(*) from trip_members where trip_id = ? and user_id = ? and status = 'ACTIVE'",
				tripId, friendId)).isEqualTo(1);
		assertThat(count("""
				select count(*) from chat_participants p join chat_rooms r on r.id = p.room_id
				where r.trip_id = ? and p.user_id = ? and p.left_at is null""", tripId, friendId)).isEqualTo(1);
		assertThat(jdbcTemplate.queryForObject("select status from trip_friend_invitations where id = ?::uuid",
				String.class, invitationId)).isEqualTo("ACCEPTED");
		assertThat(count("""
				select count(*) from notifications n join events e on e.id = n.event_id
				where n.recipient_user_id = ? and e.trip_id = ? and e.type = 'TRIP_MEMBER_JOINED'""", ownerId, tripId))
				.isEqualTo(1);
		mockMvc.perform(get("/api/v1/me/trip-invitations").with(authUser(friendId)))
				.andExpect(jsonPath("$.data", hasSize(0)));
		// 다시 눌러도 바뀌는 것 없이 같은 여행을 준다
		accept(friendId, invitationId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(2));
		mockMvc.perform(get("/api/v1/me/trip-invitations/{id}", invitationId).with(authUser(friendId)))
				.andExpect(jsonPath("$.data.status").value("ACCEPTED"))
				.andExpect(jsonPath("$.data.alreadyMember").value(true));
	}

	@Test
	void declinedOrCanceledInvitationCannotBeAccepted() throws Exception {
		UUID declining = mutualFriend("거절");
		UUID canceled = mutualFriend("취소");
		List<String> ids = invitationIds(send(ownerId, declining, canceled));

		decline(declining, ids.get(0)).andExpect(status().isNoContent());
		decline(declining, ids.get(0)).andExpect(status().isNoContent());
		mockMvc.perform(delete("/api/v1/trips/{tripId}/friend-invitations/{id}", tripId, ids.get(1))
				.with(authUser(ownerId))).andExpect(status().isNoContent());

		expectGone(accept(declining, ids.get(0)), "INVITATION_REVOKED");
		expectGone(accept(canceled, ids.get(1)), "INVITATION_REVOKED");
		decline(canceled, ids.get(1))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("FRIEND_INVITATION_NOT_FOUND"));
		mockMvc.perform(get("/api/v1/me/trip-invitations/{id}", ids.get(0)).with(authUser(declining)))
				.andExpect(jsonPath("$.data.status").value("DECLINED"));
		mockMvc.perform(get("/api/v1/me/trip-invitations/{id}", ids.get(1)).with(authUser(canceled)))
				.andExpect(jsonPath("$.data.status").value("CANCELED"));
		// 거절한 뒤에는 다시 초대할 수 있다
		assertThat(outcomes(data(send(ownerId, declining)).get("results"))).containsExactly("SENT");
	}

	@Test
	void expiredInvitationIsGoneAndCanBeSentAgain() throws Exception {
		UUID friendId = mutualFriend("민지");
		String invitationId = invitationId(send(ownerId, friendId));
		jdbcTemplate.update("""
				update trip_friend_invitations set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
				where id = ?::uuid""", invitationId);

		expectGone(accept(friendId, invitationId), "INVITATION_EXPIRED");
		mockMvc.perform(get("/api/v1/me/trip-invitations/{id}", invitationId).with(authUser(friendId)))
				.andExpect(jsonPath("$.data.status").value("EXPIRED"));
		mockMvc.perform(get("/api/v1/me/trip-invitations").with(authUser(friendId)))
				.andExpect(jsonPath("$.data", hasSize(0)));

		String again = invitationId(send(ownerId, friendId));
		assertThat(again).isNotEqualTo(invitationId);
		assertThat(jdbcTemplate.queryForObject("select status from trip_friend_invitations where id = ?::uuid",
				String.class, invitationId)).isEqualTo("CANCELED");
		accept(friendId, again).andExpect(status().isOk());
	}

	@Test
	void invitationFromMemberWhoLeftExpires() throws Exception {
		UUID inviter = mutualFriendOf(ownerId, "동행");
		insertMember(inviter, 2, "ACTIVE");
		UUID friendId = mutualFriendOf(inviter, "동행의 친구");
		String invitationId = invitationId(send(inviter, friendId));
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where trip_id = ? and user_id = ?",
				tripId, inviter);

		expectGone(accept(friendId, invitationId), "INVITATION_EXPIRED");
		mockMvc.perform(get("/api/v1/me/trip-invitations").with(authUser(friendId)))
				.andExpect(jsonPath("$.data", hasSize(0)));
	}

	@Test
	void onlyInviteeCanSeeOrAnswer() throws Exception {
		UUID friendId = mutualFriend("민지");
		String invitationId = invitationId(send(ownerId, friendId));
		UUID other = insertUser("남");

		mockMvc.perform(get("/api/v1/me/trip-invitations/{id}", invitationId).with(authUser(other)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("FRIEND_INVITATION_NOT_FOUND"));
		accept(other, invitationId).andExpect(status().isNotFound());
		decline(other, invitationId).andExpect(status().isNotFound());
	}

	@Test
	void receivedListHidesTripJoinedAnotherWay() throws Exception {
		UUID friendId = mutualFriend("민지");
		String invitationId = invitationId(send(ownerId, friendId));
		// 링크 등 다른 경로로 이미 참여했다
		insertMember(friendId, 2, "ACTIVE");

		mockMvc.perform(get("/api/v1/me/trip-invitations").with(authUser(friendId)))
				.andExpect(jsonPath("$.data", hasSize(0)));
		mockMvc.perform(get("/api/v1/me/trip-invitations/{id}", invitationId).with(authUser(friendId)))
				.andExpect(jsonPath("$.data.alreadyMember").value(true));
		accept(friendId, invitationId).andExpect(status().isOk());
	}

	@Test
	void unfollowAfterSendingStillAllowsAccept() throws Exception {
		UUID friendId = mutualFriend("민지");
		String invitationId = invitationId(send(ownerId, friendId));
		jdbcTemplate.update("delete from follows where follower_user_id = ? and followee_user_id = ?", friendId, ownerId);

		accept(friendId, invitationId).andExpect(status().isOk());
	}

	@Test
	void memberWhoLeftRejoinsWithSameMembership() throws Exception {
		UUID friendId = mutualFriend("민지");
		UUID memberId = insertMember(friendId, 2, "LEFT");
		String invitationId = invitationId(send(ownerId, friendId));

		accept(friendId, invitationId).andExpect(status().isOk());

		assertThat(jdbcTemplate.queryForObject(
				"select join_order from trip_members where id = ? and status = 'ACTIVE'", Long.class, memberId))
				.isEqualTo(3);
	}

	@Test
	void acceptChecksCapacityUnderConcurrency() throws Exception {
		UUID first = mutualFriend("첫째");
		UUID second = mutualFriend("둘째");
		List<String> ids = invitationIds(send(ownerId, first, second));
		fillTrip(19);

		CountDownLatch ready = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(2);
		List<Future<Integer>> futures = new ArrayList<>();
		try {
			List<UUID> users = List.of(first, second);
			for (int i = 0; i < 2; i++) {
				UUID user = users.get(i);
				String id = ids.get(i);
				futures.add(executor.submit(() -> {
					ready.await();
					return accept(user, id).andReturn().getResponse().getStatus();
				}));
			}
			ready.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> future : futures) statuses.add(future.get());
			assertThat(statuses).containsExactlyInAnyOrder(200, 409);
		} finally {
			executor.shutdownNow();
		}
		assertThat(count("select count(*) from trip_members where trip_id = ? and status = 'ACTIVE'", tripId))
				.isEqualTo(20);
	}

	@Test
	void documentsFriendInvitationApis() throws Exception {
		String send = "$.paths['/api/v1/trips/{tripId}/friend-invitations'].post";
		String accept = "$.paths['/api/v1/me/trip-invitations/{invitationId}/accept'].post";
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath(send + ".tags[0]").value("초대"))
				.andExpect(jsonPath(send + ".responses['409'].description").value(containsString("TRIP_FULL")))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/invitable-friends'].get.summary").exists())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/friend-invitations/{invitationId}'].delete").exists())
				.andExpect(jsonPath("$.paths['/api/v1/me/trip-invitations'].get").exists())
				.andExpect(jsonPath("$.paths['/api/v1/me/trip-invitations/{invitationId}'].get").exists())
				.andExpect(jsonPath(accept + ".responses['410'].description").value(containsString("INVITATION_REVOKED")))
				.andExpect(jsonPath("$.paths['/api/v1/me/trip-invitations/{invitationId}/decline'].post").exists());
	}

	private void fillTrip(int activeMembers) {
		for (int i = 2; i <= activeMembers; i++) {
			insertMember(insertUser("채움" + i), i + 100, "ACTIVE");
		}
	}

	private ResultActions send(UUID me, UUID... invitees) throws Exception {
		String ids = Arrays.stream(invitees).map(id -> "\"" + id + "\"").collect(Collectors.joining(","));
		return mockMvc.perform(post("/api/v1/trips/{tripId}/friend-invitations", tripId).with(authUser(me))
				.contentType(MediaType.APPLICATION_JSON).content("{\"inviteeUserIds\":[" + ids + "]}"));
	}

	private ResultActions accept(UUID me, String invitationId) throws Exception {
		return mockMvc.perform(post("/api/v1/me/trip-invitations/{id}/accept", invitationId).with(authUser(me)));
	}

	private ResultActions decline(UUID me, String invitationId) throws Exception {
		return mockMvc.perform(post("/api/v1/me/trip-invitations/{id}/decline", invitationId).with(authUser(me)));
	}

	private String invitationId(ResultActions result) throws Exception {
		return invitationIds(result).getFirst();
	}

	private List<String> invitationIds(ResultActions result) throws Exception {
		List<String> ids = new ArrayList<>();
		for (JsonNode node : data(result.andExpect(status().isOk())).get("results")) {
			assertThat(node.get("result").asString()).isEqualTo("SENT");
			ids.add(node.get("invitationId").asString());
		}
		return ids;
	}

	private List<String> outcomes(JsonNode results) {
		List<String> list = new ArrayList<>();
		results.forEach(node -> list.add(node.get("result").asString()));
		return list;
	}

	private void expectGone(ResultActions result, String code) throws Exception {
		result.andExpect(status().isGone())
				.andExpect(jsonPath("$.error.code").value(code));
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

	private long count(String sql, Object... args) {
		return jdbcTemplate.queryForObject(sql, Long.class, args);
	}

	private UUID mutualFriend(String nickname) {
		return mutualFriendOf(ownerId, nickname);
	}

	private UUID mutualFriendOf(UUID me, String nickname) {
		UUID id = insertUser(nickname);
		follow(me, id, "ACCEPTED");
		follow(id, me, "ACCEPTED");
		return id;
	}

	private void follow(UUID follower, UUID followee, String status) {
		jdbcTemplate.update("""
				insert into follows (id, follower_user_id, followee_user_id, status, requested_at, accepted_at)
				values (?, ?, ?, ?, now(), case when ? = 'ACCEPTED' then now() end)""",
				UUID.randomUUID(), follower, followee, status, status);
	}

	private UUID insertUser(String nickname) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, ?, true, now(), now())""", id, nickname);
		return id;
	}

	// 수락을 거치지 않고 넣는 멤버는 채팅 참여를 함께 넣는다(ACTIVE만)
	private UUID insertMember(UUID userId, long joinOrder, String status) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at, left_at)
				values (?, ?, ?, ?, ?, now(), case when ? = 'ACTIVE' then null else now() end)""",
				id, tripId, userId, status, joinOrder, status);
		if (status.equals("ACTIVE")) {
			jdbcTemplate.update("""
					insert into chat_participants (room_id, user_id, joined_at)
					select id, ?, now() from chat_rooms where trip_id = ?""", userId, tripId);
		}
		return id;
	}

}
