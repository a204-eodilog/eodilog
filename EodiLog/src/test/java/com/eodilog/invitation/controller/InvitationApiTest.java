package com.eodilog.invitation.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.invitation.domain.InvitationToken;
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
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 정원 검사의 동시 수락을 확인해야 하므로 테스트 트랜잭션을 쓰지 않는다. 테스트마다 새 사용자·여행으로 자료를 구분한다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class InvitationApiTest {

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
						.content("{\"title\":\"제주\",\"startDate\":\"2026-11-01\",\"endDate\":\"2026-11-04\"}"))
				.andExpect(status().isCreated())).get("id").asString());
	}

	@Test
	void createsSevenDayLinkAndStoresOnlyHash() throws Exception {
		JsonNode invitation = data(createInvitation(ownerId)
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.token").value(matchesPattern("[A-Za-z0-9_-]{43}"))));
		String token = invitation.get("token").asString();

		assertThat(invitation.get("url").asString()).isEqualTo("ieohaeng://invitations/" + token);
		assertThat(UUID.fromString(invitation.get("id").asString()).version()).isEqualTo(7);
		assertThat(jdbcTemplate.queryForObject("select token_hash from trip_invitations where trip_id = ?",
				String.class, tripId)).isEqualTo(InvitationToken.hash(token)).isNotEqualTo(token);
		assertThat(count("""
				select count(*) from trip_invitations
				where trip_id = ? and expires_at - created_at = interval '7 days'""", tripId)).isEqualTo(1);
	}

	@Test
	void hidesTripFromNonMembersWhenCreating() throws Exception {
		createInvitation(insertUser("모르는 사람"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
		mockMvc.perform(post("/api/v1/trips/{tripId}/invitations", tripId)).andExpect(status().isUnauthorized());
		assertThat(count("select count(*) from trip_invitations where trip_id = ?", tripId)).isZero();
	}

	@Test
	void newLinkRevokesEarlierLinksOfSameTrip() throws Exception {
		UUID friendId = insertUser("동행");
		insertMember(friendId, 2, "ACTIVE");
		String first = token(createInvitation(ownerId));
		UUID joinedId = insertUser("먼저 참여한 손님");
		acceptInvitation(joinedId, first).andExpect(status().isOk());
		// 다른 멤버가 새로 발급해도 여행 단위로 이전 링크가 무효가 된다
		String second = token(createInvitation(friendId));
		UUID guestId = insertUser("손님");

		expectGone(mockMvc.perform(get("/api/v1/invitations/{token}", first)), "INVITATION_REVOKED");
		expectGone(acceptInvitation(guestId, first), "INVITATION_REVOKED");
		// 재발급은 기존 참여자에게 영향이 없다. 옛 링크로 들어와도 이미 참여 중으로 보여 주고 같은 여행을 준다
		mockMvc.perform(get("/api/v1/invitations/{token}", first).with(authUser(joinedId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.alreadyMember").value(true));
		acceptInvitation(joinedId, first)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(2));
		assertThat(count("select count(*) from trip_members where trip_id = ? and user_id = ? and status = 'ACTIVE'",
				tripId, joinedId)).isEqualTo(1);
		mockMvc.perform(get("/api/v1/invitations/{token}", second))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.inviter.nickname").value("동행"));
		acceptInvitation(guestId, second).andExpect(status().isOk());
		assertThat(count("select count(*) from trip_invitations where trip_id = ? and revoked_at is null", tripId))
				.isEqualTo(1);
	}

	@Test
	void keepsOneUsableLinkWhenIssuedConcurrently() throws Exception {
		List<UUID> issuers = List.of(ownerId, insertUser("동행1"), insertUser("동행2"));
		for (int i = 1; i < issuers.size(); i++) {
			insertMember(issuers.get(i), i + 1, "ACTIVE");
		}
		CountDownLatch ready = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(issuers.size());
		List<Future<MockHttpServletResponse>> futures = new ArrayList<>();
		try {
			for (UUID issuerId : issuers) {
				futures.add(executor.submit(() -> {
					ready.await();
					return createInvitation(issuerId).andReturn().getResponse();
				}));
			}
			ready.countDown();

			List<String> tokens = new ArrayList<>();
			for (Future<MockHttpServletResponse> future : futures) {
				MockHttpServletResponse response = future.get();
				assertThat(response.getStatus()).isEqualTo(201);
				tokens.add(jsonMapper.readTree(response.getContentAsString()).get("data").get("token").asString());
			}
			assertThat(count("select count(*) from trip_invitations where trip_id = ? and revoked_at is null", tripId))
					.isEqualTo(1);
			long usable = 0;
			for (String token : tokens) {
				if (mockMvc.perform(get("/api/v1/invitations/{token}", token)).andReturn().getResponse().getStatus() == 200) {
					usable++;
				}
			}
			assertThat(usable).isEqualTo(1);
		} finally {
			executor.shutdownNow();
		}
	}

	@Test
	void cancelRevokesUsableLinkWithoutIssuingNewOne() throws Exception {
		UUID friendId = insertUser("동행");
		insertMember(friendId, 2, "ACTIVE");
		String token = token(createInvitation(ownerId));
		UUID guestId = insertUser("손님");

		// 링크를 만든 사람이 아니어도 ACTIVE 멤버면 취소한다
		cancelInvitations(friendId).andExpect(status().isNoContent());

		expectGone(mockMvc.perform(get("/api/v1/invitations/{token}", token)), "INVITATION_REVOKED");
		expectGone(acceptInvitation(guestId, token), "INVITATION_REVOKED");
		// 이미 동행인 사람은 취소된 링크로도 이미 참여 중으로 본다
		mockMvc.perform(get("/api/v1/invitations/{token}", token).with(authUser(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.alreadyMember").value(true));
		assertThat(count("select count(*) from trip_invitations where trip_id = ?", tripId)).isEqualTo(1);
		assertThat(count("select count(*) from trip_invitations where trip_id = ? and revoked_at is null", tripId))
				.isZero();
		assertThat(count("select version from trips where id = ?", tripId)).isEqualTo(1);
		assertThat(count("select count(*) from trip_members where trip_id = ? and user_id = ?", tripId, guestId))
				.isZero();

		// 다시 취소해도 그대로 성공하고, 취소 뒤 새로 만든 링크는 쓸 수 있다
		cancelInvitations(ownerId).andExpect(status().isNoContent());
		acceptInvitation(guestId, token(createInvitation(ownerId))).andExpect(status().isOk());
	}

	@Test
	void cancelSucceedsWithoutUsableLinkAndKeepsExpiredReason() throws Exception {
		cancelInvitations(ownerId).andExpect(status().isNoContent());

		String expired = token(createInvitation(ownerId));
		jdbcTemplate.update("""
				update trip_invitations set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
				where token_hash = ?""", InvitationToken.hash(expired));
		cancelInvitations(ownerId).andExpect(status().isNoContent());
		// 이미 만료된 링크는 무효화하지 않아 만료 사유를 그대로 알린다
		expectExpired(mockMvc.perform(get("/api/v1/invitations/{token}", expired)));
		assertThat(count("select count(*) from trip_invitations where trip_id = ? and revoked_at is not null", tripId))
				.isZero();
	}

	@Test
	void hidesTripFromNonMembersWhenCancelling() throws Exception {
		String token = token(createInvitation(ownerId));
		UUID leftId = insertUser("나간 동행");
		insertMember(leftId, 2, "LEFT");

		for (UUID outsiderId : List.of(insertUser("모르는 사람"), leftId)) {
			cancelInvitations(outsiderId)
					.andExpect(status().isNotFound())
					.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
		}
		mockMvc.perform(delete("/api/v1/trips/{tripId}/invitations", tripId)).andExpect(status().isUnauthorized());
		mockMvc.perform(delete("/api/v1/trips/{tripId}/invitations", "not-a-uuid").with(authUser(ownerId)))
				.andExpect(status().isBadRequest());
		mockMvc.perform(get("/api/v1/invitations/{token}", token)).andExpect(status().isOk());

		jdbcTemplate.update("update trips set deleted_at = now() where id = ?", tripId);
		cancelInvitations(ownerId).andExpect(status().isNotFound());
	}

	@Test
	void showsPreviewWithoutLoginAndCardWhenLoggedIn() throws Exception {
		String token = token(createInvitation(ownerId));

		JsonNode preview = body(mockMvc.perform(get("/api/v1/invitations/{token}", token))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.tripTitle").value("제주"))
				.andExpect(jsonPath("$.data.startDate").value("2026-11-01"))
				.andExpect(jsonPath("$.data.endDate").value("2026-11-04"))
				.andExpect(jsonPath("$.data.inviter.nickname").value("방장"))
				.andExpect(jsonPath("$.data.inviterUser").isEmpty())
				.andExpect(jsonPath("$.data.expiresAt").isNotEmpty())
				.andExpect(jsonPath("$.data.alreadyMember").value(false))).get("data");
		// 공개 응답에 동행 명단·여행 ID 같은 내부 자료를 싣지 않는다
		assertThat(preview.propertyNames()).containsExactlyInAnyOrder(
				"tripTitle", "startDate", "endDate", "inviter", "inviterUser", "expiresAt", "alreadyMember");

		mockMvc.perform(get("/api/v1/invitations/{token}", token).with(authUser(insertUser("손님"))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.inviterUser.id").value(ownerId.toString()))
				.andExpect(jsonPath("$.data.inviterUser.nickname").value("방장"))
				.andExpect(jsonPath("$.data.alreadyMember").value(false));
		mockMvc.perform(get("/api/v1/invitations/{token}", token).with(authUser(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.alreadyMember").value(true));
	}

	@Test
	void acceptJoinsTripAndChatOnceAndBumpsTripVersion() throws Exception {
		String token = token(createInvitation(ownerId));
		UUID guestId = insertUser("손님");

		acceptInvitation(guestId, token)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.id").value(tripId.toString()))
				.andExpect(jsonPath("$.data.version").value(2))
				.andExpect(jsonPath("$.data.members", hasSize(2)))
				.andExpect(jsonPath("$.data.members[1].user.id").value(guestId.toString()))
				.andExpect(jsonPath("$.data.members[1].role").value("MEMBER"))
				.andExpect(jsonPath("$.data.members[1].joinOrder").value(2));
		assertThat(activeChatParticipants()).isEqualTo(2);

		// 이미 ACTIVE면 바뀌는 것 없이 같은 여행을 돌려준다
		acceptInvitation(guestId, token)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(2))
				.andExpect(jsonPath("$.data.members", hasSize(2)));
		assertThat(count("select count(*) from trip_members where trip_id = ?", tripId)).isEqualTo(2);
		mockMvc.perform(get("/api/v1/trips/{tripId}", tripId).with(authUser(guestId))).andExpect(status().isOk());

		// 참여로 members가 바뀌었으므로 이전 version 기준의 여행 수정은 409다(M-2와 같은 규칙)
		mockMvc.perform(patch("/api/v1/trips/{tripId}", tripId).with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"expectedVersion\":1,\"title\":\"제주 3박\"}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
	}

	@Test
	void rejoinsLeftMemberWithSameMembershipAndLastJoinOrder() throws Exception {
		UUID guestId = insertUser("돌아온 손님");
		UUID membershipId = insertMember(guestId, 2, "LEFT");
		jdbcTemplate.update("""
				insert into chat_participants (room_id, user_id, joined_at, left_at)
				select id, ?, now(), now() from chat_rooms where trip_id = ?""", guestId, tripId);
		insertMember(insertUser("동행"), 3, "ACTIVE");

		acceptInvitation(guestId, token(createInvitation(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.members[2].id").value(membershipId.toString()))
				.andExpect(jsonPath("$.data.members[2].joinOrder").value(4));
		assertThat(count("""
				select count(*) from trip_members
				where id = ? and status = 'ACTIVE' and left_at is null and join_order = 4""", membershipId)).isEqualTo(1);
		assertThat(count("""
				select count(*) from chat_participants p join chat_rooms r on r.id = p.room_id
				where r.trip_id = ? and p.user_id = ? and p.left_at is null""", tripId, guestId)).isEqualTo(1);
	}

	@Test
	void rejectsMalformedAndUnusableTokens() throws Exception {
		UUID guestId = insertUser("손님");
		mockMvc.perform(get("/api/v1/invitations/{token}", "not-a-token"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
		acceptInvitation(guestId, "not-a-token").andExpect(status().isNotFound());

		String unknown = InvitationToken.generate();
		expectExpired(mockMvc.perform(get("/api/v1/invitations/{token}", unknown)));
		expectExpired(acceptInvitation(guestId, unknown));

		String expired = token(createInvitation(ownerId));
		jdbcTemplate.update("""
				update trip_invitations set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
				where token_hash = ?""", InvitationToken.hash(expired));
		expectExpired(mockMvc.perform(get("/api/v1/invitations/{token}", expired)));
		expectExpired(acceptInvitation(guestId, expired));
		// 이미 동행인 사람은 기간이 지난 링크로도 이미 참여 중으로 보고 같은 여행을 받는다
		mockMvc.perform(get("/api/v1/invitations/{token}", expired).with(authUser(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.alreadyMember").value(true));
		acceptInvitation(ownerId, expired).andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(1));

		// 초대한 사람이 여행을 나가면 그 사람의 링크는 더 쓸 수 없다
		UUID friendId = insertUser("동행");
		UUID friendMemberId = insertMember(friendId, 2, "ACTIVE");
		String friendLink = token(createInvitation(friendId));
		// 이미 만료된 링크는 새 발급으로 무효화하지 않고 만료 사유를 유지한다
		expectExpired(mockMvc.perform(get("/api/v1/invitations/{token}", expired)));
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where id = ?", friendMemberId);
		expectExpired(mockMvc.perform(get("/api/v1/invitations/{token}", friendLink)));
		expectExpired(acceptInvitation(guestId, friendLink));

		String deletedTripLink = token(createInvitation(ownerId));
		jdbcTemplate.update("update trips set deleted_at = now() where id = ?", tripId);
		expectExpired(mockMvc.perform(get("/api/v1/invitations/{token}", deletedTripLink)));
		expectExpired(acceptInvitation(guestId, deletedTripLink));

		assertThat(count("select count(*) from trip_members where trip_id = ? and user_id = ?", tripId, guestId)).isZero();
		mockMvc.perform(post("/api/v1/invitations/{token}/accept", unknown)).andExpect(status().isUnauthorized());
	}

	@Test
	void rejectsNewMemberWhenTripHasTwentyActiveMembers() throws Exception {
		for (int joinOrder = 2; joinOrder <= 20; joinOrder++) {
			insertMember(insertUser("동행" + joinOrder), joinOrder, "ACTIVE");
		}
		String token = token(createInvitation(ownerId));

		acceptInvitation(insertUser("21번째"), token)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("TRIP_FULL"));
		assertThat(count("select count(*) from trip_members where trip_id = ? and status = 'ACTIVE'", tripId))
				.isEqualTo(20);
		assertThat(count("select version from trips where id = ?", tripId)).isEqualTo(1);
		// 이미 참여 중인 사람은 정원과 상관없이 같은 여행을 받는다
		acceptInvitation(ownerId, token).andExpect(status().isOk());
	}

	@Test
	void letsOnlyOneConcurrentAcceptTakeLastSeat() throws Exception {
		for (int joinOrder = 2; joinOrder <= 19; joinOrder++) {
			insertMember(insertUser("동행" + joinOrder), joinOrder, "ACTIVE");
		}
		String token = token(createInvitation(ownerId));
		List<UUID> guests = List.of(insertUser("손님1"), insertUser("손님2"), insertUser("손님3"));
		CountDownLatch ready = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(guests.size());
		List<Future<MockHttpServletResponse>> futures = new ArrayList<>();
		try {
			for (UUID guestId : guests) {
				futures.add(executor.submit(() -> {
					ready.await();
					return acceptInvitation(guestId, token).andReturn().getResponse();
				}));
			}
			ready.countDown();

			List<Integer> statuses = new ArrayList<>();
			for (Future<MockHttpServletResponse> future : futures) {
				statuses.add(future.get().getStatus());
			}
			assertThat(statuses).containsExactlyInAnyOrder(200, 409, 409);
			assertThat(count("select count(*) from trip_members where trip_id = ? and status = 'ACTIVE'", tripId))
					.isEqualTo(20);
			assertThat(count("select max(join_order) from trip_members where trip_id = ?", tripId)).isEqualTo(20);
		} finally {
			executor.shutdownNow();
		}
	}

	@Test
	void documentsInvitationApis() throws Exception {
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/invitations'].post.tags[0]").value("초대"))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/invitations'].delete.tags[0]").value("초대"))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/invitations'].delete.responses['204']").exists())
				.andExpect(jsonPath("$.paths['/api/v1/invitations/{token}'].get.security", hasSize(0)))
				// 공개 API지만 Authorization 헤더를 보내면 검증하므로 401·403을 직접 적는다
				.andExpect(jsonPath("$.paths['/api/v1/invitations/{token}'].get.responses['401'].description")
						.value(containsString("UNAUTHENTICATED")))
				.andExpect(jsonPath("$.paths['/api/v1/invitations/{token}'].get.responses['403'].description")
						.value(containsString("PROFILE_INCOMPLETE")))
				.andExpect(jsonPath("$.paths['/api/v1/invitations/{token}'].get.responses['410'].description")
						.value(containsString("INVITATION_REVOKED")))
				.andExpect(jsonPath("$.paths['/api/v1/invitations/{token}/accept'].post.responses['409'].description")
						.value(containsString("TRIP_FULL")));
	}

	@Test
	void notifiesExistingMembersWhenSomeoneJoins() throws Exception {
		UUID friendId = insertUser("동행");
		insertMember(friendId, 2, "ACTIVE");
		String token = token(createInvitation(ownerId));
		UUID guestId = insertUser("손님");

		acceptInvitation(guestId, token).andExpect(status().isOk());
		// 이미 ACTIVE인 사람의 재수락은 멤버십이 바뀌지 않아 알리지 않는다
		acceptInvitation(guestId, token).andExpect(status().isOk());

		assertThat(joinedNotifications(ownerId)).containsExactly("손님님이 여행에 참여했어요.");
		assertThat(joinedNotifications(friendId)).containsExactly("손님님이 여행에 참여했어요.");
		assertThat(joinedNotifications(guestId)).isEmpty();
		assertThat(jdbcTemplate.queryForObject(
				"select actor_user_id from events where trip_id = ? and type = 'TRIP_MEMBER_JOINED'", UUID.class, tripId))
				.isEqualTo(guestId);

		// 나갔다가 다시 들어오면 새 참여 순번으로 한 번 더 알린다. 본인은 여전히 받지 않는다
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where trip_id = ? and user_id = ?",
				tripId, guestId);
		acceptInvitation(guestId, token).andExpect(status().isOk());
		assertThat(joinedNotifications(ownerId)).hasSize(2);
		assertThat(joinedNotifications(guestId)).isEmpty();
		assertThat(count("select count(*) from events where trip_id = ? and type = 'TRIP_MEMBER_JOINED'", tripId))
				.isEqualTo(2);
	}

	private List<String> joinedNotifications(UUID userId) {
		return jdbcTemplate.queryForList("""
				select e.payload_json->>'message' from notifications n join events e on e.id = n.event_id
				where n.recipient_user_id = ? and e.trip_id = ? and e.type = 'TRIP_MEMBER_JOINED'
				order by e.created_at, e.id""", String.class, userId, tripId);
	}

	private void expectExpired(ResultActions result) throws Exception {
		expectGone(result, "INVITATION_EXPIRED");
	}

	private void expectGone(ResultActions result, String code) throws Exception {
		result.andExpect(status().isGone())
				.andExpect(jsonPath("$.error.code").value(code));
	}

	private ResultActions createInvitation(UUID userId) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/invitations", tripId).with(authUser(userId)));
	}

	private ResultActions cancelInvitations(UUID userId) throws Exception {
		return mockMvc.perform(delete("/api/v1/trips/{tripId}/invitations", tripId).with(authUser(userId)));
	}

	private ResultActions acceptInvitation(UUID userId, String token) throws Exception {
		return mockMvc.perform(post("/api/v1/invitations/{token}/accept", token).with(authUser(userId)));
	}

	private String token(ResultActions result) throws Exception {
		return data(result.andExpect(status().isCreated())).get("token").asString();
	}

	private JsonNode body(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString());
	}

	private JsonNode data(ResultActions result) throws Exception {
		return body(result).get("data");
	}

	private long activeChatParticipants() {
		return count("""
				select count(*) from chat_participants p join chat_rooms r on r.id = p.room_id
				where r.trip_id = ? and p.left_at is null""", tripId);
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
