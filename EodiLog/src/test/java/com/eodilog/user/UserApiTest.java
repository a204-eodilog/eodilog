package com.eodilog.user;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
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
class UserApiTest {

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	@Autowired JsonMapper mapper;

	@Test
	void searchMatchesPartialNicknameCaseInsensitivelyAndExcludesSelfAndUnavailable() throws Exception {
		String tag = tag();
		UUID me = user(tag + "Me", "PUBLIC");
		UUID exact = user(tag, "PRIVATE");
		UUID upper = user(tag.toUpperCase() + "여행", "PUBLIC");
		UUID suffix = user("앞" + tag + "뒤", "PUBLIC");
		UUID gone = user(tag + "탈퇴", "PUBLIC");
		jdbc.update("UPDATE users SET status='DEACTIVATED',deactivated_at=CURRENT_TIMESTAMP WHERE id=?", gone);
		UUID pending = UUID.randomUUID();
		jdbc.update("INSERT INTO users(id,nickname,profile_completed,created_at,updated_at) VALUES(?,'',false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", pending);
		user("무관한사람" + UUID.randomUUID().toString().substring(0, 4), "PUBLIC");
		jdbc.update("INSERT INTO follows(id,follower_user_id,followee_user_id,status,requested_at) VALUES(?,?,?,'REQUESTED',CURRENT_TIMESTAMP)",
				UUID.randomUUID(), me, exact);

		JsonNode body = json(search(me, "  " + tag.toLowerCase() + "  ", null, 20).andExpect(status().isOk())
				.andExpect(jsonPath("$.page.hasNext").value(false)));
		List<String> ids = ids(body);
		// 완전 일치가 먼저다. 비공개 계정도 카드는 보인다
		assertThat(ids.getFirst()).isEqualTo(exact.toString());
		assertThat(ids).containsExactlyInAnyOrder(exact.toString(), upper.toString(), suffix.toString());
		assertThat(body.get("data").get(0).get("accountVisibility").asString()).isEqualTo("PRIVATE");
		assertThat(body.get("data").get(0).get("followingStatus").asString()).isEqualTo("REQUESTED");
		// 연령·이메일 같은 비공개 필드는 카드에 없다
		assertThat(body.get("data").get(0).has("ageBand")).isFalse();
	}

	@Test
	void searchPagesWithoutDuplicatesAndTreatsLikeWildcardsLiterally() throws Exception {
		String tag = tag();
		UUID me = user("검색자" + tag, "PUBLIC");
		List<String> expected = new ArrayList<>();
		for (int i = 0; i < 5; i++) expected.add(user(tag + "_" + i, "PUBLIC").toString());
		user(tag + "x9", "PUBLIC"); // '_'가 와일드카드로 해석되면 함께 잡힌다

		List<String> seen = new ArrayList<>();
		String cursor = null;
		do {
			JsonNode page = json(search(me, tag + "_", cursor, 2).andExpect(status().isOk()));
			seen.addAll(ids(page));
			cursor = page.get("page").get("hasNext").asBoolean() ? page.get("page").get("nextCursor").asString() : null;
		} while (cursor != null);
		assertThat(seen).containsExactlyElementsOf(expected);

		UUID percent = user(tag + "%p", "PUBLIC");
		assertThat(ids(json(search(me, tag + "%", null, 20)))).containsExactly(percent.toString());
	}

	@Test
	void searchRejectsBadInput() throws Exception {
		UUID me = user("검증" + tag(), "PUBLIC");
		search(me, "   ", null, 20).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.fields[0].field").value("query"));
		search(me, "가".repeat(51), null, 20).andExpect(status().isBadRequest());
		search(me, "가", null, 51).andExpect(status().isBadRequest());
		search(me, "가", null, 0).andExpect(status().isBadRequest());
		search(me, "가", "broken!", 20).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.fields[0].field").value("cursor"));
		mvc.perform(get("/api/v1/users").with(authUser(me))).andExpect(status().isBadRequest());
	}

	@Test
	void publicProfileHasCountsAndNoPrivateFields() throws Exception {
		UUID me = user("보는이" + tag(), "PUBLIC"), target = user("대상" + tag(), "PRIVATE");
		UUID a = user("a" + tag(), "PUBLIC"), b = user("b" + tag(), "PUBLIC"), gone = user("g" + tag(), "PUBLIC");
		follow(a, target, "ACCEPTED");
		follow(b, target, "ACCEPTED");
		follow(me, target, "REQUESTED"); // 대기 요청은 세지 않는다
		follow(gone, target, "ACCEPTED");
		jdbc.update("UPDATE users SET status='DEACTIVATED',deactivated_at=CURRENT_TIMESTAMP WHERE id=?", gone);
		follow(target, a, "ACCEPTED");
		jdbc.update("UPDATE users SET age_band='THIRTIES',age_use_consent=true WHERE id=?", target);

		mvc.perform(get("/api/v1/users/" + target).with(authUser(me))).andExpect(status().isOk())
				.andExpect(jsonPath("$.data.id").value(target.toString()))
				.andExpect(jsonPath("$.data.accountVisibility").value("PRIVATE"))
				.andExpect(jsonPath("$.data.followingStatus").value("REQUESTED"))
				.andExpect(jsonPath("$.data.followedByStatus").value("NONE"))
				.andExpect(jsonPath("$.data.followerCount").value(2))
				.andExpect(jsonPath("$.data.followingCount").value(1))
				.andExpect(jsonPath("$.data.ageBand").doesNotExist())
				.andExpect(jsonPath("$.data.ageUseConsent").doesNotExist())
				.andExpect(jsonPath("$.data.email").doesNotExist());
		mvc.perform(get("/api/v1/users/" + me).with(authUser(me))).andExpect(status().isOk())
				.andExpect(jsonPath("$.data.followerCount").value(0));
		mvc.perform(get("/api/v1/users/" + gone).with(authUser(me))).andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("USER_NOT_FOUND"));
		mvc.perform(get("/api/v1/users/" + UUID.randomUUID()).with(authUser(me))).andExpect(status().isNotFound());
	}

	@Test
	void patchMeSetsAndClearsProfileImageAgeBandAndConsent() throws Exception {
		UUID me = user("편집" + tag(), "PRIVATE");
		UUID image = asset(me, "PROFILE", "READY");
		patchMe(me, "{\"profileImageAssetId\":\"" + image + "\",\"ageBand\":\"TWENTIES\",\"ageUseConsent\":true}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.profileImageUrl").value("/assets/" + image + "/download"))
				.andExpect(jsonPath("$.data.ageBand").value("TWENTIES"))
				.andExpect(jsonPath("$.data.ageUseConsent").value(true))
				.andExpect(jsonPath("$.data.accountVisibility").value("PRIVATE"));
		mvc.perform(get("/api/v1/me").with(authUser(me))).andExpect(jsonPath("$.data.ageBand").value("TWENTIES"));
		// 다른 사람이 보는 카드에도 사진이 나온다
		UUID viewer = user("보는이" + tag(), "PUBLIC");
		mvc.perform(get("/api/v1/users/" + me).with(authUser(viewer)))
				.andExpect(jsonPath("$.data.profileImageUrl").value("/assets/" + image + "/download"));
		assertThat(jdbc.queryForObject("SELECT profile_asset_id FROM users WHERE id=?", UUID.class, me)).isEqualTo(image);

		patchMe(me, "{\"profileImageAssetId\":null,\"ageBand\":null,\"ageUseConsent\":false}").andExpect(status().isOk())
				.andExpect(jsonPath("$.data.profileImageUrl").isEmpty())
				.andExpect(jsonPath("$.data.ageBand").isEmpty())
				.andExpect(jsonPath("$.data.ageUseConsent").value(false));
	}

	@Test
	void patchMeRejectsUnusableImageAndBadAgeWithoutPartialWrites() throws Exception {
		UUID me = user("검사" + tag(), "PRIVATE"), other = user("남" + tag(), "PUBLIC");
		List<UUID> bad = List.of(asset(other, "PROFILE", "READY"), asset(me, "PROFILE", "PENDING"),
				asset(me, "CAPTURE", "READY"), UUID.randomUUID());
		for (UUID image : bad)
			patchMe(me, "{\"accountVisibility\":\"PUBLIC\",\"profileImageAssetId\":\"" + image + "\"}")
					.andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("INVALID_PROFILE_IMAGE"));
		assertThat(jdbc.queryForObject("SELECT account_visibility FROM users WHERE id=?", String.class, me)).isEqualTo("PRIVATE");
		for (String body : List.of("{\"ageBand\":\"20대\"}", "{\"ageBand\":\"20\"}", "{\"ageUseConsent\":null}",
				"{\"profileImageAssetId\":\"not-uuid\"}"))
			patchMe(me, body).andExpect(status().isBadRequest());
		assertThat(jdbc.queryForObject("SELECT age_band FROM users WHERE id=?", String.class, me)).isNull();
	}

	@Test
	void pendingUserCanSetProfileFieldsTogetherWithNickname() throws Exception {
		UUID pending = UUID.randomUUID();
		jdbc.update("INSERT INTO users(id,nickname,profile_completed,created_at,updated_at) VALUES(?,'',false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", pending);
		patchMe(pending, "{\"ageBand\":\"FORTIES\"}").andExpect(status().isBadRequest());
		patchMe(pending, "{\"nickname\":\"새사람\",\"ageBand\":\"FORTIES\",\"ageUseConsent\":true}").andExpect(status().isOk())
				.andExpect(jsonPath("$.data.profileCompleted").value(true))
				.andExpect(jsonPath("$.data.ageBand").value("FORTIES"));
	}

	@Test
	void openApiDocumentsUserEndpoints() throws Exception {
		String body = mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		var paths = mapper.readTree(body).get("paths");
		assertThat(paths.get("/api/v1/users").has("get")).isTrue();
		assertThat(paths.get("/api/v1/users/{userId}").has("get")).isTrue();
		assertThat(body).contains("PublicProfile", "followerCount", "profileImageAssetId", "SIXTIES_PLUS", "INVALID_PROFILE_IMAGE");
	}

	private static String tag() {
		return "t" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
	}

	private UUID user(String nickname, String visibility) {
		UUID id = UUID.randomUUID();
		jdbc.update("INSERT INTO users(id,nickname,profile_completed,account_visibility,created_at,updated_at) VALUES(?,?,true,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
				id, nickname, visibility);
		return id;
	}

	private void follow(UUID follower, UUID followee, String status) {
		jdbc.update("INSERT INTO follows(id,follower_user_id,followee_user_id,status,requested_at,accepted_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,"
				+ ("ACCEPTED".equals(status) ? "CURRENT_TIMESTAMP" : "NULL") + ")", UUID.randomUUID(), follower, followee, status);
	}

	private UUID asset(UUID owner, String purpose, String status) {
		UUID id = UUID.randomUUID();
		jdbc.update("INSERT INTO assets(id,owner_user_id,purpose,object_key,content_type,byte_size,status,created_at) VALUES(?,?,?,?,'image/png',10,?,CURRENT_TIMESTAMP)",
				id, owner, purpose, "test/" + id, status);
		return id;
	}

	private ResultActions search(UUID me, String query, String cursor, int limit) throws Exception {
		var request = get("/api/v1/users").param("query", query).param("limit", String.valueOf(limit)).with(authUser(me));
		if (cursor != null) request.param("cursor", cursor);
		return mvc.perform(request);
	}

	private ResultActions patchMe(UUID me, String body) throws Exception {
		return mvc.perform(patch("/api/v1/me").with(authUser(me)).contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private JsonNode json(ResultActions result) throws Exception {
		return mapper.readTree(result.andReturn().getResponse().getContentAsString());
	}

	private static List<String> ids(JsonNode page) {
		List<String> ids = new ArrayList<>();
		page.get("data").forEach(n -> ids.add(n.get("id").asString()));
		return ids;
	}

}
