package com.eodilog.user.follow;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.user.service.FollowAccess;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
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

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class FollowApiTest {

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	@Autowired JsonMapper mapper;
	@Autowired FollowService service;
	@Autowired FollowAccess access;

	@Test
	void publicTargetIsAcceptedImmediatelyWithoutNotificationAndIsIdempotent() throws Exception {
		UUID me = user("PUBLIC"), target = user("PUBLIC");
		String id = json(follow(me, target).andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("ACCEPTED"))
				.andExpect(jsonPath("$.data.acceptedAt").isNotEmpty())
				.andExpect(jsonPath("$.data.follower.id").value(me.toString()))
				.andExpect(jsonPath("$.data.followee.id").value(target.toString()))
				.andExpect(jsonPath("$.data.followee.followingStatus").value("ACCEPTED"))
				.andExpect(jsonPath("$.data.followee.followedByStatus").value("NONE")))
				.get("data").get("id").asString();
		follow(me, target).andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(id));
		assertThat(rows(me, target)).isEqualTo(1);
		assertThat(rows(target, me)).isZero();
		assertThat(notifications(target)).isEmpty();
	}

	@Test
	void privateTargetGetsRequestAndNotificationThenAcceptNotifiesRequester() throws Exception {
		UUID me = user("PUBLIC"), target = user("PRIVATE");
		String requestId = json(follow(me, target).andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("REQUESTED"))
				.andExpect(jsonPath("$.data.acceptedAt").isEmpty()))
				.get("data").get("id").asString();
		follow(me, target).andExpect(jsonPath("$.data.id").value(requestId)).andExpect(jsonPath("$.data.status").value("REQUESTED"));
		assertThat(notifications(target)).containsExactly("FOLLOW_REQUESTED");
		assertThat(access.canViewMemberContent(me, target)).isFalse();

		// 요청자 본인이나 제3자는 수락할 수 없다
		UUID other = user("PUBLIC");
		accept(me, requestId).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("FOLLOW_REQUEST_NOT_FOUND"));
		accept(other, requestId).andExpect(status().isNotFound());

		accept(target, requestId).andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("ACCEPTED"))
				.andExpect(jsonPath("$.data.follower.followedByStatus").value("ACCEPTED"));
		accept(target, requestId).andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("ACCEPTED"));
		assertThat(notifications(me)).containsExactly("FOLLOW_ACCEPTED");
		assertThat(rows(target, me)).isZero();
		assertThat(access.canViewMemberContent(me, target)).isTrue();
		assertThat(access.canViewMemberContent(target, me)).isTrue(); // me는 PUBLIC
	}

	@Test
	void followRequestNotificationsRespectRecipientSetting() throws Exception {
		UUID me = user("PUBLIC"), target = user("PRIVATE");
		jdbc.update("INSERT INTO user_settings(user_id,follow_requests_enabled) VALUES(?,false)", target);
		jdbc.update("INSERT INTO user_settings(user_id,follow_requests_enabled) VALUES(?,false)", me);
		String requestId = json(follow(me, target)).get("data").get("id").asString();
		accept(target, requestId).andExpect(status().isOk());
		assertThat(notifications(target)).isEmpty();
		assertThat(notifications(me)).isEmpty();
	}

	@Test
	void selfAndUnavailableTargetsAreRejected() throws Exception {
		UUID me = user("PUBLIC");
		follow(me, me).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("CANNOT_FOLLOW_SELF"));
		follow(me, UUID.randomUUID()).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("USER_NOT_FOUND"));
		UUID gone = user("PUBLIC");
		jdbc.update("UPDATE users SET status='DEACTIVATED',deactivated_at=CURRENT_TIMESTAMP WHERE id=?", gone);
		follow(me, gone).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("USER_NOT_FOUND"));
		UUID pending = UUID.randomUUID();
		jdbc.update("INSERT INTO users(id,nickname,profile_completed,account_visibility,created_at,updated_at) VALUES(?,'',false,'PUBLIC',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", pending);
		follow(me, pending).andExpect(status().isNotFound());
		mvc.perform(post("/api/v1/users/not-a-uuid/follow").with(authUser(me))).andExpect(status().isBadRequest());
	}

	@Test
	void cancelRejectUnfollowAndRemoveFollowerOnlyTouchOneDirection() throws Exception {
		UUID a = user("PRIVATE"), b = user("PRIVATE");
		String ab = json(follow(a, b)).get("data").get("id").asString();
		String ba = json(follow(b, a)).get("data").get("id").asString();

		// 당사자가 아니면 지울 수 없다
		mvc.perform(delete("/api/v1/me/follow-requests/" + ab).with(authUser(user("PUBLIC"))))
				.andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("FOLLOW_REQUEST_NOT_FOUND"));
		// 보낸 사람 취소
		mvc.perform(delete("/api/v1/me/follow-requests/" + ab).with(authUser(a))).andExpect(status().isNoContent());
		assertThat(rows(a, b)).isZero();
		assertThat(rows(b, a)).isEqualTo(1);
		mvc.perform(delete("/api/v1/me/follow-requests/" + ab).with(authUser(a))).andExpect(status().isNotFound());
		// 받은 사람 거절
		mvc.perform(delete("/api/v1/me/follow-requests/" + ba).with(authUser(a))).andExpect(status().isNoContent());
		assertThat(rows(b, a)).isZero();

		// 수락된 관계는 요청 삭제로 지우지 않는다
		String again = json(follow(a, b)).get("data").get("id").asString();
		accept(b, again).andExpect(status().isOk());
		mvc.perform(delete("/api/v1/me/follow-requests/" + again).with(authUser(b))).andExpect(status().isNotFound());
		String back = json(follow(b, a)).get("data").get("id").asString();
		accept(a, back).andExpect(status().isOk());

		// 팔로워 제거는 나를 향한 방향만
		mvc.perform(delete("/api/v1/me/followers/" + a).with(authUser(b))).andExpect(status().isNoContent());
		assertThat(rows(a, b)).isZero();
		assertThat(rows(b, a)).isEqualTo(1);
		mvc.perform(delete("/api/v1/me/followers/" + a).with(authUser(b))).andExpect(status().isNoContent());
		// 언팔로우는 내가 보낸 방향만
		mvc.perform(delete("/api/v1/users/" + a + "/follow").with(authUser(b))).andExpect(status().isNoContent());
		assertThat(rows(b, a)).isZero();
		mvc.perform(delete("/api/v1/users/" + a + "/follow").with(authUser(b))).andExpect(status().isNoContent());

		// 언팔로우는 대기 요청도 취소한다
		follow(a, b);
		mvc.perform(delete("/api/v1/users/" + b + "/follow").with(authUser(a))).andExpect(status().isNoContent());
		assertThat(rows(a, b)).isZero();
	}

	@Test
	void listsSplitByDirectionAndStatusPageAndHideUnavailableUsers() throws Exception {
		UUID me = user("PRIVATE");
		List<UUID> followees = new ArrayList<>();
		for (int i = 0; i < 3; i++) {
			UUID target = user("PUBLIC");
			followees.add(target);
			follow(me, target);
		}
		UUID privateTarget = user("PRIVATE");
		follow(me, privateTarget);
		UUID requester = user("PUBLIC"), follower = user("PUBLIC");
		follow(requester, me);
		accept(me, json(follow(follower, me)).get("data").get("id").asString());

		JsonNode first = json(mvc.perform(get("/api/v1/me/following").param("limit", "2").with(authUser(me)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.page.hasNext").value(true)));
		assertThat(first.get("data")).hasSize(2);
		JsonNode second = json(mvc.perform(get("/api/v1/me/following").param("limit", "2")
				.param("cursor", first.get("page").get("nextCursor").asString()).with(authUser(me)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.page.hasNext").value(false)));
		List<String> seen = new ArrayList<>();
		first.get("data").forEach(n -> seen.add(n.get("followee").get("id").asString()));
		second.get("data").forEach(n -> seen.add(n.get("followee").get("id").asString()));
		assertThat(seen).containsExactlyInAnyOrderElementsOf(followees.stream().map(UUID::toString).toList());

		mvc.perform(get("/api/v1/me/followers").with(authUser(me))).andExpect(status().isOk())
				.andExpect(jsonPath("$.data.length()").value(1))
				.andExpect(jsonPath("$.data[0].follower.id").value(follower.toString()))
				.andExpect(jsonPath("$.data[0].status").value("ACCEPTED"));
		mvc.perform(get("/api/v1/me/follow-requests").param("direction", "RECEIVED").with(authUser(me)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1))
				.andExpect(jsonPath("$.data[0].follower.id").value(requester.toString()))
				.andExpect(jsonPath("$.data[0].status").value("REQUESTED"));
		mvc.perform(get("/api/v1/me/follow-requests").param("direction", "SENT").with(authUser(me)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1))
				.andExpect(jsonPath("$.data[0].followee.id").value(privateTarget.toString()));

		// 탈퇴한 상대는 목록과 판정에서 빠진다
		jdbc.update("UPDATE users SET status='DEACTIVATED',deactivated_at=CURRENT_TIMESTAMP WHERE id=?", followees.getFirst());
		mvc.perform(get("/api/v1/me/following").with(authUser(me))).andExpect(jsonPath("$.data.length()").value(2));
		assertThat(access.acceptedFolloweeIds(me)).containsExactlyInAnyOrderElementsOf(followees.subList(1, 3));

		mvc.perform(get("/api/v1/me/follow-requests").with(authUser(me))).andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/me/follow-requests").param("direction", "BOTH").with(authUser(me))).andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/me/following").param("limit", "101").with(authUser(me))).andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/me/following").param("limit", "0").with(authUser(me))).andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/me/following").param("cursor", "broken").with(authUser(me))).andExpect(status().isBadRequest());
	}

	@Test
	void switchingToPublicAcceptsPendingSilentlyAndPrivateKeepsFollowers() throws Exception {
		UUID me = user("PRIVATE"), waiting = user("PUBLIC"), approved = user("PUBLIC");
		follow(waiting, me);
		accept(me, json(follow(approved, me)).get("data").get("id").asString());
		int before = notifications(waiting).size();

		patchMe(me, "{\"accountVisibility\":\"PUBLIC\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.data.accountVisibility").value("PUBLIC"));
		assertThat(relation(waiting, me)).isEqualTo("ACCEPTED");
		assertThat(notifications(waiting)).hasSize(before);

		patchMe(me, "{\"accountVisibility\":\"PRIVATE\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.data.accountVisibility").value("PRIVATE"));
		assertThat(relation(waiting, me)).isEqualTo("ACCEPTED");
		assertThat(relation(approved, me)).isEqualTo("ACCEPTED");
		assertThat(access.canViewMemberContent(waiting, me)).isTrue();

		// 비공개 상태에서 새로 온 요청은 콘텐츠 접근을 허용하지 않는다
		UUID late = user("PUBLIC");
		follow(late, me).andExpect(jsonPath("$.data.status").value("REQUESTED"));
		assertThat(access.canViewMemberContent(late, me)).isFalse();
		// 같은 값으로 다시 바꾸면 아무것도 하지 않는다
		patchMe(me, "{\"accountVisibility\":\"PRIVATE\"}").andExpect(status().isOk());
		assertThat(relation(late, me)).isEqualTo("REQUESTED");
	}

	@Test
	void patchMeKeepsNicknameCompletionAndRejectsBadBodies() throws Exception {
		UUID pending = UUID.randomUUID();
		jdbc.update("INSERT INTO users(id,nickname,profile_completed,created_at,updated_at) VALUES(?,'',false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", pending);
		patchMe(pending, "{\"accountVisibility\":\"PUBLIC\"}").andExpect(status().isBadRequest());
		patchMe(pending, "{\"nickname\":\"  여행자  \",\"accountVisibility\":\"PUBLIC\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.data.nickname").value("여행자"))
				.andExpect(jsonPath("$.data.profileCompleted").value(true))
				.andExpect(jsonPath("$.data.accountVisibility").value("PUBLIC"));

		UUID me = user("PRIVATE");
		for (String body : List.of("{}", "{\"nickname\":null}", "{\"accountVisibility\":null}",
				"{\"accountVisibility\":\"FRIENDS\"}", "{\"nickname\":\" \"}", "{\"ageBand\":\"TWENTIES\"}"))
			patchMe(me, body).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
		assertThat(jdbc.queryForObject("SELECT account_visibility FROM users WHERE id=?", String.class, me)).isEqualTo("PRIVATE");
		patchMe(me, "{\"nickname\":\"새 이름\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.data.nickname").value("새 이름"))
				.andExpect(jsonPath("$.data.accountVisibility").value("PRIVATE"));
	}

	@Test
	void followAccessCombinesVisibilityRelationAndAccountState() throws Exception {
		UUID viewer = user("PRIVATE"), open = user("PUBLIC"), closed = user("PRIVATE"), approved = user("PRIVATE"),
				waiting = user("PRIVATE"), gone = user("PUBLIC"), followsViewer = user("PRIVATE");
		accept(approved, json(follow(viewer, approved)).get("data").get("id").asString());
		follow(viewer, waiting);
		accept(viewer, json(follow(followsViewer, viewer)).get("data").get("id").asString());
		accept(gone, json(follow(viewer, gone)).get("data").get("id").asString());
		jdbc.update("UPDATE users SET status='DEACTIVATED',deactivated_at=CURRENT_TIMESTAMP WHERE id=?", gone);

		Set<UUID> allowed = access.viewableMembers(viewer,
				List.of(viewer, open, closed, approved, waiting, gone, followsViewer, UUID.randomUUID()));
		assertThat(allowed).containsExactly(viewer, open, approved);
		assertThat(access.canViewMemberContent(viewer, closed)).isFalse();
		// 상대가 나를 팔로우하는 것은 내 쪽 열람 권한이 아니다
		assertThat(access.canViewMemberContent(viewer, followsViewer)).isFalse();
		assertThat(access.acceptedFolloweeIds(viewer)).containsExactly(approved);
		assertThat(access.viewableMembers(viewer, List.of())).isEmpty();
		assertThat(access.canViewMemberContent(null, open)).isFalse();

		// 탈퇴한 viewer는 아무것도 볼 수 없다
		jdbc.update("UPDATE users SET status='DEACTIVATED',deactivated_at=CURRENT_TIMESTAMP WHERE id=?", viewer);
		assertThat(access.viewableMembers(viewer, List.of(viewer, open, approved))).isEmpty();
		assertThat(access.acceptedFolloweeIds(viewer)).isEmpty();
	}

	@Test
	void concurrentFollowCreatesOneRowAndOneNotification() throws Exception {
		UUID me = user("PUBLIC"), target = user("PRIVATE");
		var pool = Executors.newFixedThreadPool(4);
		try {
			CountDownLatch start = new CountDownLatch(1);
			List<Future<FollowResponse>> results = new ArrayList<>();
			for (int i = 0; i < 4; i++) {
				Callable<FollowResponse> call = () -> {
					start.await();
					return service.follow(me, target);
				};
				results.add(pool.submit(call));
			}
			start.countDown();
			Set<UUID> ids = new java.util.HashSet<>();
			for (var result : results) ids.add(result.get().id());
			assertThat(ids).hasSize(1);
		} finally {
			pool.shutdownNow();
		}
		assertThat(rows(me, target)).isEqualTo(1);
		assertThat(notifications(target)).containsExactly("FOLLOW_REQUESTED");
	}

	@Test
	void openApiDocumentsFollowEndpoints() throws Exception {
		String body = mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		var paths = mapper.readTree(body).get("paths");
		assertThat(paths.get("/api/v1/users/{userId}/follow").has("post")).isTrue();
		assertThat(paths.get("/api/v1/users/{userId}/follow").has("delete")).isTrue();
		assertThat(paths.get("/api/v1/me/following").has("get")).isTrue();
		assertThat(paths.get("/api/v1/me/followers").has("get")).isTrue();
		assertThat(paths.get("/api/v1/me/follow-requests").has("get")).isTrue();
		assertThat(paths.get("/api/v1/me/follow-requests/{requestId}/accept").has("post")).isTrue();
		assertThat(paths.get("/api/v1/me/follow-requests/{requestId}").has("delete")).isTrue();
		assertThat(paths.get("/api/v1/me/followers/{userId}").has("delete")).isTrue();
		assertThat(body).contains("CANNOT_FOLLOW_SELF", "FOLLOW_REQUEST_NOT_FOUND", "ProfilePatch", "accountVisibility");
	}

	private UUID user(String visibility) {
		UUID id = UUID.randomUUID();
		jdbc.update("INSERT INTO users(id,nickname,profile_completed,account_visibility,created_at,updated_at) VALUES(?,?,true,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
				id, "u" + id.toString().substring(0, 8), visibility);
		return id;
	}

	private ResultActions follow(UUID me, UUID target) throws Exception {
		return mvc.perform(post("/api/v1/users/" + target + "/follow").with(authUser(me)));
	}

	private ResultActions accept(UUID me, String requestId) throws Exception {
		return mvc.perform(post("/api/v1/me/follow-requests/" + requestId + "/accept").with(authUser(me)));
	}

	private ResultActions patchMe(UUID me, String body) throws Exception {
		return mvc.perform(patch("/api/v1/me").with(authUser(me)).contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private JsonNode json(ResultActions result) throws Exception {
		return mapper.readTree(result.andReturn().getResponse().getContentAsString());
	}

	private int rows(UUID follower, UUID followee) {
		return jdbc.queryForObject("SELECT count(*) FROM follows WHERE follower_user_id=? AND followee_user_id=?",
				Integer.class, follower, followee);
	}

	private String relation(UUID follower, UUID followee) {
		return jdbc.queryForObject("SELECT status FROM follows WHERE follower_user_id=? AND followee_user_id=?",
				String.class, follower, followee);
	}

	private List<String> notifications(UUID recipient) {
		return jdbc.queryForList("SELECT e.type FROM notifications n JOIN events e ON e.id=n.event_id WHERE n.recipient_user_id=? ORDER BY n.created_at",
				String.class, recipient);
	}

}
