package com.eodilog.user.preference;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.ai.AiServerClient;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.job.JobWorker;
import com.eodilog.place.service.PersonalBookmarkService;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.LockSupport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

// 취향 직접 입력·AI 추론·삭제 거부·여행별 공유 동의(EODI-245). AI 서버는 가짜로 바꾸고 실제 jobs worker를 직접 돌린다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class PreferenceApiTest {

	private static final String AI_PATH = "/ai/v1/preference-inferences";

	@Autowired MockMvc mockMvc;
	@Autowired JdbcTemplate jdbc;
	@Autowired JsonMapper jsonMapper;
	@Autowired JobWorker worker;
	@Autowired PersonalBookmarkService bookmarks;
	@Autowired org.springframework.transaction.support.TransactionTemplate tx;

	@MockitoBean AiServerClient ai;

	private final List<UUID> users = new ArrayList<>();
	private final List<UUID> places = new ArrayList<>();
	private UUID userId;

	@BeforeEach
	void setUp() {
		userId = insertUser(true);
		answerWith("카페", "바다");
	}

	@AfterEach
	void cleanUp() {
		for (UUID id : users) {
			jdbc.update("delete from jobs where requested_by_user_id=?", id);
			jdbc.update("delete from user_preferences where user_id=?", id);
			jdbc.update("delete from user_preference_rejections where user_id=?", id);
			jdbc.update("delete from user_preference_states where user_id=?", id);
			jdbc.update("delete from personal_bookmarks where user_id=?", id);
		}
	}

	@Test
	void firstReadReturnsDefaultsWithoutWritesOrAiCalls() throws Exception {
		mockMvc.perform(get("/api/v1/me/preferences").with(authUser(userId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.explicitItems.length()").value(0))
				.andExpect(jsonPath("$.data.inferredItems.length()").value(0))
				.andExpect(jsonPath("$.data.allowInference").value(false))
				.andExpect(jsonPath("$.data.sharingScope").value("NONE"));
		assertThat(count("select count(*) from user_preference_states where user_id=?", userId)).isZero();
		verify(ai, never()).post(anyString(), any(), any());
	}

	@Test
	void putValidatesExplicitItems() throws Exception {
		String tooMany = "[" + String.join(",", java.util.stream.IntStream.range(0, 21)
				.mapToObj(i -> item("태그" + i)).toList()) + "]";
		for (String items : List.of(tooMany, "[" + item("Cafe") + "," + item(" cafe ") + "]",
				"[{\"key\":\"카페\",\"value\":\"바다\"}]", "[" + item("   ") + "]",
				"[" + item("가".repeat(21)) + "]")) {
			putPreferences(userId, items, false, "NONE").andExpect(status().isBadRequest());
		}
		mockMvc.perform(put("/api/v1/me/preferences").with(authUser(userId)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"explicitItems\":[],\"allowInference\":false}")).andExpect(status().isBadRequest());

		putPreferences(userId, "[" + item("  조용한   골목 ") + "," + item("Cafe") + "]", false, "EXPLICIT_ONLY")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.explicitItems[0].key").value("조용한 골목"))
				.andExpect(jsonPath("$.data.explicitItems[1].value").value("Cafe"))
				.andExpect(jsonPath("$.data.sharingScope").value("EXPLICIT_ONLY"));
		assertThat(count("select count(*) from jobs where requested_by_user_id=?", userId)).isZero();
	}

	@Test
	void consentOnInfersFromOwnSavedPlacesAndStoresValidatedResult() throws Exception {
		saveBookmarks(userId, 5);
		assertThat(count("select count(*) from jobs where requested_by_user_id=?", userId)).isZero();

		putPreferences(userId, "[" + item("야경") + "]", true, "EXPLICIT_AND_INFERRED").andExpect(status().isOk());
		UUID jobId = onlyJob(userId);
		runUntil(jobId, Set.of("SUCCEEDED"));

		ArgumentCaptor<JsonNode> body = ArgumentCaptor.forClass(JsonNode.class);
		verify(ai).post(eq(AI_PATH), eq(jobId), body.capture());
		JsonNode sent = body.getValue();
		assertThat(sent.get("userId").asString()).isEqualTo(userId.toString());
		assertThat(sent.get("savedPlaces").size()).isEqualTo(5);
		assertThat(sent.get("explicitItems").get(0).get("key").asString()).isEqualTo("야경");
		assertThat(sent.get("rejectedKeys").size()).isZero();

		mockMvc.perform(get("/api/v1/me/preferences").with(authUser(userId)))
				.andExpect(jsonPath("$.data.explicitItems[0].key").value("야경"))
				.andExpect(jsonPath("$.data.inferredItems.length()").value(2))
				.andExpect(jsonPath("$.data.inferredItems[0].key").value("카페"))
				.andExpect(jsonPath("$.data.allowInference").value(true));
		mockMvc.perform(get("/api/v1/jobs/{id}", jobId).with(authUser(userId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.result.inferredItems.length()").value(2));
		UUID other = insertUser(true);
		mockMvc.perform(get("/api/v1/jobs/{id}", jobId).with(authUser(other))).andExpect(status().isNotFound());
	}

	@Test
	void tooFewPlacesFailsWithoutCallingAiAndKeepsExplicitItems() throws Exception {
		saveBookmarks(userId, 4);
		putPreferences(userId, "[" + item("산") + "]", true, "NONE").andExpect(status().isOk());
		UUID jobId = onlyJob(userId);
		runUntil(jobId, Set.of("FAILED"));
		assertThat(jdbc.queryForObject("select error_code from jobs where id=?", String.class, jobId))
				.isEqualTo("INSUFFICIENT_DATA");
		verify(ai, never()).post(anyString(), any(), any());
		mockMvc.perform(get("/api/v1/me/preferences").with(authUser(userId)))
				.andExpect(jsonPath("$.data.explicitItems[0].key").value("산"));
	}

	@Test
	void invalidAiResultIsNotStored() throws Exception {
		saveBookmarks(userId, 5);
		answerWith("우주여행");
		putPreferences(userId, "[]", true, "NONE").andExpect(status().isOk());
		UUID jobId = onlyJob(userId);
		runUntil(jobId, Set.of("FAILED"));
		assertThat(count("select count(*) from user_preferences where user_id=? and source='INFERRED'", userId)).isZero();
	}

	@Test
	void deletedInferenceStaysDeletedUntilSavedPlaceSetChanges() throws Exception {
		List<UUID> saved = saveBookmarks(userId, 5);
		putPreferences(userId, "[]", true, "NONE").andExpect(status().isOk());
		runUntil(onlyJob(userId), Set.of("SUCCEEDED"));

		mockMvc.perform(delete("/api/v1/me/preferences/inferred/{key}", "카페").with(authUser(userId)))
				.andExpect(status().isNoContent());
		mockMvc.perform(delete("/api/v1/me/preferences/inferred/{key}", "없는태그").with(authUser(userId)))
				.andExpect(status().isBadRequest());
		assertThat(inferredKeys(userId)).containsExactly("바다");

		// 메모 수정·같은 장소 재저장·직접 취향 변경은 거부를 풀지 않는다
		int jobs = count("select count(*) from jobs where requested_by_user_id=?", userId);
		mockMvc.perform(patch("/api/v1/me/bookmarks/{id}", saved.getFirst()).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON).content("{\"memo\":\"다시\"}")).andExpect(status().isOk());
		mockMvc.perform(put("/api/v1/me/bookmarks/{id}", saved.getFirst()).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON).content("{\"memo\":\"또\"}")).andExpect(status().isOk());
		assertThat(count("select count(*) from jobs where requested_by_user_id=?", userId)).isEqualTo(jobs);
		putPreferences(userId, "[" + item("휴식") + "]", true, "NONE").andExpect(status().isOk());
		UUID afterExplicit = latestJob(userId);
		clearInvocations(ai);
		runUntil(afterExplicit, Set.of("SUCCEEDED", "FAILED"));
		ArgumentCaptor<JsonNode> body = ArgumentCaptor.forClass(JsonNode.class);
		verify(ai).post(eq(AI_PATH), eq(afterExplicit), body.capture());
		assertThat(body.getValue().get("rejectedKeys").get(0).asString()).isEqualTo("카페");
		// AI가 거부 키를 돌려줘도 저장하지 않는다
		assertThat(inferredKeys(userId)).doesNotContain("카페");

		// 고유 저장 장소 구성이 바뀌면 거부를 풀고 다시 추론한다
		saveBookmarks(userId, 1);
		assertThat(count("select count(*) from user_preference_rejections where user_id=?", userId)).isZero();
		UUID afterPlaces = latestJob(userId);
		runUntil(afterPlaces, Set.of("SUCCEEDED"));
		assertThat(inferredKeys(userId)).contains("카페");
	}

	@Test
	void turningInferenceOffDeletesInferredItemsImmediatelyAndKeepsTheRest() throws Exception {
		saveBookmarks(userId, 5);
		putPreferences(userId, "[" + item("산책") + "]", true, "EXPLICIT_AND_INFERRED").andExpect(status().isOk());
		runUntil(onlyJob(userId), Set.of("SUCCEEDED"));

		putPreferences(userId, "[" + item("산책") + "]", false, "EXPLICIT_AND_INFERRED")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.inferredItems.length()").value(0))
				.andExpect(jsonPath("$.data.explicitItems[0].key").value("산책"));
		assertThat(count("select count(*) from user_preferences where user_id=? and source='INFERRED'", userId)).isZero();
		assertThat(count("select count(*) from personal_bookmarks where user_id=?", userId)).isEqualTo(5);
	}

	@Test
	void staleResultIsNotAppliedAfterInputChanges() throws Exception {
		saveBookmarks(userId, 5);
		putPreferences(userId, "[]", true, "NONE").andExpect(status().isOk());
		UUID stale = onlyJob(userId);
		putPreferences(userId, "[]", false, "NONE").andExpect(status().isOk());
		// 실행 전 재검사에서 막히면 CANCELLED, 실행 뒤 저장 재검사에서 막히면 FAILED(POLICY_REVOKED)다
		runUntil(stale, Set.of("CANCELLED", "FAILED"));
		verify(ai, never()).post(anyString(), any(), any());
		assertThat(count("select count(*) from user_preferences where user_id=? and source='INFERRED'", userId)).isZero();
	}

	@Test
	void tripConsentOverridesGlobalScopeButNotInferenceRefusal() throws Exception {
		UUID tripId = createTrip(userId);
		putPreferences(userId, "[]", false, "EXPLICIT_AND_INFERRED").andExpect(status().isOk());
		consent(userId, tripId, "INHERIT").andExpect(status().isOk())
				.andExpect(jsonPath("$.data.scope").value("INHERIT"))
				.andExpect(jsonPath("$.data.effectiveScope").value("EXPLICIT_ONLY"));
		consent(userId, tripId, "NONE").andExpect(jsonPath("$.data.effectiveScope").value("NONE"));
		putPreferences(userId, "[]", true, "EXPLICIT_ONLY").andExpect(status().isOk());
		consent(userId, tripId, "EXPLICIT_AND_INFERRED")
				.andExpect(jsonPath("$.data.effectiveScope").value("EXPLICIT_AND_INFERRED"));
		consent(userId, tripId, "INHERIT").andExpect(jsonPath("$.data.effectiveScope").value("EXPLICIT_ONLY"));
		assertThat(jdbc.queryForObject("select preference_scope from trip_members where trip_id=? and user_id=?",
				String.class, tripId, userId)).isEqualTo("INHERIT");

		consent(insertUser(true), tripId, "NONE").andExpect(status().isNotFound());
		consent(userId, tripId, "ALL").andExpect(status().isBadRequest());
	}

	@Test
	void savedPlaceWritesStillWorkForUsersOutsideThePreferenceFeature() {
		UUID incomplete = insertUser(false);
		UUID placeId = insertPlace();
		tx.executeWithoutResult(s -> bookmarks.put(incomplete, placeId, null, null));
		tx.executeWithoutResult(s -> bookmarks.delete(incomplete, placeId));
		assertThat(count("select count(*) from user_preference_states where user_id=?", incomplete)).isZero();
	}

	@Test
	void updatedAtMovesOnlyWithPreferenceChangesNotProfileEdits() throws Exception {
		putPreferences(userId, "[]", false, "NONE").andExpect(status().isOk());
		java.time.Instant old = java.time.Instant.parse("2020-01-01T00:00:00Z");
		jdbc.update("update user_preference_states set updated_at=? where user_id=?", java.sql.Timestamp.from(old), userId);
		assertThat(preferencesUpdatedAt(userId)).isEqualTo(old);

		mockMvc.perform(patch("/api/v1/me").with(authUser(userId)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"nickname\":\"새닉" + userId.toString().substring(0, 6) + "\"}")).andExpect(status().isOk());
		assertThat(preferencesUpdatedAt(userId)).isEqualTo(old);
		putPreferences(userId, "[]", false, "NONE").andExpect(status().isOk());
		assertThat(preferencesUpdatedAt(userId)).as("unchanged PUT").isEqualTo(old);

		putPreferences(userId, "[]", false, "EXPLICIT_ONLY").andExpect(status().isOk())
				.andExpect(jsonPath("$.data.sharingScope").value("EXPLICIT_ONLY"));
		assertThat(preferencesUpdatedAt(userId)).as("sharingScope-only PUT").isAfter(old);
	}

	private java.time.Instant preferencesUpdatedAt(UUID user) throws Exception {
		String body = mockMvc.perform(get("/api/v1/me/preferences").with(authUser(user))).andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString();
		return java.time.Instant.parse(jsonMapper.readTree(body).path("data").path("updatedAt").asString());
	}

	private ResultActions putPreferences(UUID user, String items, boolean allow, String scope) throws Exception {
		return mockMvc.perform(put("/api/v1/me/preferences").with(authUser(user)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"explicitItems\":" + items + ",\"allowInference\":" + allow + ",\"sharingScope\":\"" + scope + "\"}"));
	}

	private ResultActions consent(UUID user, UUID tripId, String scope) throws Exception {
		return mockMvc.perform(put("/api/v1/trips/{tripId}/members/me/preference-consent", tripId).with(authUser(user))
				.contentType(MediaType.APPLICATION_JSON).content("{\"scope\":\"" + scope + "\"}"));
	}

	private static String item(String value) {
		return "{\"key\":\"" + value + "\",\"value\":\"" + value + "\"}";
	}

	private void answerWith(String... tags) {
		doAnswer(invocation -> {
			ObjectNode data = jsonMapper.createObjectNode();
			var items = data.putArray("inferredItems");
			for (String tag : tags) items.addObject().put("key", tag).put("value", tag);
			return data;
		}).when(ai).post(anyString(), any(), any());
	}

	private List<UUID> saveBookmarks(UUID user, int n) throws Exception {
		List<UUID> ids = new ArrayList<>();
		for (int i = 0; i < n; i++) {
			UUID placeId = insertPlace();
			mockMvc.perform(put("/api/v1/me/bookmarks/{id}", placeId).with(authUser(user)))
					.andExpect(status().isOk());
			ids.add(placeId);
		}
		return ids;
	}

	private List<String> inferredKeys(UUID user) {
		return jdbc.queryForList("select key from user_preferences where user_id=? and source='INFERRED' order by position",
				String.class, user);
	}

	private UUID onlyJob(UUID user) {
		assertThat(count("select count(*) from jobs where requested_by_user_id=? and kind='PREFERENCE_INFERENCE'", user))
				.isEqualTo(1);
		return latestJob(user);
	}

	private UUID latestJob(UUID user) {
		return jdbc.queryForObject("select id from jobs where requested_by_user_id=? and kind='PREFERENCE_INFERENCE' "
				+ "order by created_at desc, id desc limit 1", UUID.class, user);
	}

	private void runUntil(UUID jobId, Set<String> expected) {
		long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
		while (!expected.contains(state(jobId)) && System.nanoTime() < until) {
			if (!state(jobId).equals("QUEUED") || !worker.pollOnce()) {
				LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(10));
			}
		}
		assertThat(state(jobId)).isIn(expected);
	}

	private String state(UUID jobId) {
		return jdbc.queryForObject("select status from jobs where id=?", String.class, jobId);
	}

	private int count(String sql, Object... args) {
		return jdbc.queryForObject(sql, Integer.class, args);
	}

	private UUID insertUser(boolean completed) {
		UUID id = UUID.randomUUID();
		jdbc.update("insert into users (id, nickname, profile_completed, created_at, updated_at) values (?, ?, ?, now(), now())",
				id, completed ? "취향" : "", completed);
		users.add(id);
		return id;
	}

	private UUID insertPlace() {
		UUID id = UUID.randomUUID();
		jdbc.update("insert into places (id, name, latitude, longitude, source, created_at, updated_at) "
				+ "values (?, ?, 35.1587, 129.1604, 'MANUAL', now(), now())", id, "장소 " + id.toString().substring(0, 8));
		places.add(id);
		return id;
	}

	private UUID createTrip(UUID owner) throws Exception {
		String body = mockMvc.perform(post("/api/v1/trips").with(authUser(owner))
				.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"취향 여행\"}"))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		return UUID.fromString(jsonMapper.readTree(body).get("data").get("id").asString());
	}
}
