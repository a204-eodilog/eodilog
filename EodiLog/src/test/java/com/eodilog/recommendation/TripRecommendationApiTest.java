package com.eodilog.recommendation;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.ai.AiServerClient;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.job.JobWorker;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.LockSupport;
import java.util.function.Function;
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

// AI 여행지 추천 요청 → 작업 실행 → 조회(EODI-284). AI 서버는 가짜로 바꾸고 jobs worker를 직접 돌린다.
// 다른 테스트의 장소와 섞이지 않게 테스트 전용 지역(상위·하위)을 만들어 그 안에만 장소를 둔다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class TripRecommendationApiTest {

	@Autowired private MockMvc mockMvc;
	@Autowired private JdbcTemplate jdbcTemplate;
	@Autowired private JsonMapper jsonMapper;
	@Autowired private JobWorker worker;
	@MockitoBean private AiServerClient aiServerClient;

	private final List<UUID> trips = new ArrayList<>();
	private UUID owner, friend, third, tripId, root, child, elsewhere;
	private UUID savedA, savedB, savedC, cafe, beach, farCafe, plain;

	@BeforeEach
	void setUp() throws Exception {
		// 방장: 직접 입력 카페, 전역 EXPLICIT_ONLY / 동행: 전역 공유지만 이 여행만 NONE / 셋째: 추론 범위인데 추론 불허 → 직접 입력만
		owner = insertUser("방장", "EXPLICIT_ONLY", true);
		friend = insertUser("동행", "EXPLICIT_AND_INFERRED", true);
		third = insertUser("셋째", "EXPLICIT_AND_INFERRED", false);
		taste(owner, "EXPLICIT", "카페", 0);
		taste(friend, "EXPLICIT", "야경", 0);
		taste(third, "EXPLICIT", "바다", 0);
		taste(owner, "INFERRED", "산책", 0);
		tripId = createTrip(owner);
		UUID friendMember = insertMember(tripId, friend, 2);
		insertMember(tripId, third, 3);
		jdbcTemplate.update("update trip_members set preference_scope = 'NONE' where id = ?", friendMember);

		String tag = Long.toString(System.nanoTime(), 36);
		root = insertRegion("TR-" + tag, "테스트도", null);
		child = insertRegion("TR-" + tag + "-1", "테스트도 바닷시", root);
		elsewhere = insertRegion("TR-" + tag + "-X", "다른도", null);
		jdbcTemplate.update("insert into trip_destinations (trip_id, region_id, display_order) values (?, ?, 0)", tripId, root);

		savedA = insertPlace("모은 카페 하나", child, "음식>커피점/카페>카페");
		savedB = insertPlace("모은 식당", child, "음식>한식>백반");
		savedC = insertPlace("모은 공원", child, null);
		cafe = insertPlace("바닷가 커피집", child, "음식>커피점/카페>카페");
		beach = insertPlace("송도해수욕장", child, "관광지>자연관광지>해수욕장");
		farCafe = insertPlace("다른 곳 카페", elsewhere, "음식>커피점/카페>카페");
		plain = insertPlace("분류 없는 카페", child, null);
		save(owner, savedA);
		save(third, savedA);
		save(owner, savedB);
		save(third, savedC);
	}

	@AfterEach
	void cleanUp() {
		for (UUID trip : trips) jdbcTemplate.update("delete from jobs where trip_id = ?", trip);
	}

	@Test
	void snapshotsAllowedTastesAndCandidatesThenPublishesPublicResult() throws Exception {
		answerWith(sent -> {
			ObjectNode data = jsonMapper.createObjectNode();
			var items = data.putArray("items");
			ObjectNode region = items.addObject().put("type", "REGION").put("reason", "겹친 장소가 있는 지역이에요");
			region.set("region", sent.get("regions").get(0));
			region.putNull("place");
			ObjectNode place = items.addObject().put("type", "PLACE").put("reason", "카페 취향에 맞아요");
			place.putNull("region");
			place.set("place", candidate(sent, cafe));
			data.putObject("basis").put("sharedPlaceCount", 1).put("usedMemberCount", 2);
			data.put("insufficientData", false);
			return data;
		});
		String key = UUID.randomUUID().toString();
		UUID jobId = UUID.fromString(data(request(owner, key, "{}").andExpect(status().isAccepted())
				.andExpect(jsonPath("$.data.status").value("QUEUED"))).get("jobId").asString());
		// 같은 키·같은 본문이면 새 작업을 만들지 않는다
		request(owner, key, "{}").andExpect(status().isAccepted()).andExpect(jsonPath("$.data.jobId").value(jobId.toString()));
		// 끝나기 전에는 빈 결과
		JsonNode pending = data(getResult(friend, tripId, jobId).andExpect(status().isOk()));
		assertThat(pending.get("items")).isEmpty();
		assertThat(pending.get("job").get("status").asString()).isEqualTo("QUEUED");

		runUntil(jobId, Set.of("SUCCEEDED"));

		ArgumentCaptor<JsonNode> body = ArgumentCaptor.forClass(JsonNode.class);
		verify(aiServerClient).post(eq("/ai/v1/trip-recommendations"), eq(jobId), body.capture());
		JsonNode sent = body.getValue();
		assertThat(sent.get("trip").get("id").asString()).isEqualTo(tripId.toString());
		assertThat(sent.get("trip").get("destinationRegionIds").get(0).asString()).isEqualTo(root.toString());
		// 취향: 방장은 직접 입력만(전역 EXPLICIT_ONLY라 추론 산책 제외), 동행은 이 여행 NONE, 셋째는 추론 불허라 직접 입력만
		Map<String, JsonNode> members = new HashMap<>();
		sent.get("members").forEach(m -> members.put(m.get("nickname").asString(), m));
		assertThat(members).containsOnlyKeys("방장", "동행", "셋째");
		assertThat(strings(members.get("방장").get("explicit"))).containsExactly("카페");
		assertThat(members.get("방장").get("inferred")).isEmpty();
		assertThat(members.get("동행").get("explicit")).isEmpty();
		assertThat(strings(members.get("셋째").get("explicit"))).containsExactly("바다");
		// 그룹 즐겨찾기: 두 명이 담은 곳이 먼저, 메모는 보내지 않는다
		JsonNode savedPlaces = sent.get("savedPlaces");
		assertThat(savedPlaces).hasSize(3);
		assertThat(savedPlaces.get(0).get("place").get("id").asString()).isEqualTo(savedA.toString());
		assertThat(savedPlaces.get(0).get("savedCount").asInt()).isEqualTo(2);
		assertThat(savedPlaces.get(0).get("savedBy").get(0).get("memo").isNull()).isTrue();
		// 후보: 여행지 하위 지역의 취향 맞는 장소. 즐겨찾기·여행지 밖·분류 없는 곳은 빠진다. category는 AI에만 보낸다
		List<String> candidates = new ArrayList<>();
		sent.get("candidatePlaces").forEach(p -> candidates.add(p.get("id").asString()));
		assertThat(candidates).contains(cafe.toString(), beach.toString())
				.doesNotContain(savedA.toString(), farCafe.toString(), plain.toString());
		assertThat(candidate(sent, beach).get("category").asString()).contains("해수욕장");
		assertThat(strings(sent.get("regions"), "id")).contains(child.toString());
		assertThat(sent.get("excludePlaceIds")).isEmpty();
		// 후보를 고를 지역은 작업 내부 값이라 AI에 보내지 않는다
		assertThat(sent.has(TripRecommendationSnapshot.AREA_FIELD)).isFalse();
		assertThat(sent.size()).isEqualTo(6);

		// 결과: 공개 Region·Place로 내보낸다(category 없음)
		JsonNode result = data(getResult(friend, tripId, jobId).andExpect(status().isOk()));
		assertThat(result.get("job").get("status").asString()).isEqualTo("SUCCEEDED");
		assertThat(result.get("insufficientData").asBoolean()).isFalse();
		assertThat(result.get("basis").get("sharedPlaceCount").asInt()).isEqualTo(1);
		assertThat(result.get("basis").get("usedMemberCount").asInt()).isEqualTo(2);
		JsonNode items = result.get("items");
		assertThat(items).hasSize(2);
		assertThat(items.get(0).get("type").asString()).isEqualTo("REGION");
		assertThat(items.get(0).get("region").get("id").asString()).isEqualTo(sent.get("regions").get(0).get("id").asString());
		assertThat(items.get(0).get("place").isNull()).isTrue();
		assertThat(items.get(1).get("type").asString()).isEqualTo("PLACE");
		assertThat(items.get(1).get("place").get("id").asString()).isEqualTo(cafe.toString());
		assertThat(items.get(1).get("place").get("name").asString()).isEqualTo("바닷가 커피집");
		assertThat(items.get(1).get("place").has("category")).isFalse();
		assertThat(items.get(1).get("reason").asString()).isEqualTo("카페 취향에 맞아요");
		// GET /jobs도 같은 모양이고 입력(취향·좌표)은 내보내지 않는다
		JsonNode job = data(mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(third))).andExpect(status().isOk()));
		assertThat(job.get("result").get("items").get(1).get("place").get("id").asString()).isEqualTo(cafe.toString());
		assertThat(job.get("result").toString()).doesNotContain("explicit", "category");
	}

	@Test
	void passesInsufficientDataThroughAndNarrowsCandidatesToRegion() throws Exception {
		answerWith(sent -> {
			ObjectNode data = jsonMapper.createObjectNode();
			data.putArray("items");
			data.putObject("basis").put("sharedPlaceCount", 0).put("usedMemberCount", 1);
			data.put("insufficientData", true);
			return data;
		});
		UUID jobId = UUID.fromString(data(request(owner, UUID.randomUUID().toString(),
				"{\"regionId\":\"%s\"}".formatted(elsewhere)).andExpect(status().isAccepted())).get("jobId").asString());
		runUntil(jobId, Set.of("SUCCEEDED"));
		ArgumentCaptor<JsonNode> body = ArgumentCaptor.forClass(JsonNode.class);
		verify(aiServerClient).post(eq("/ai/v1/trip-recommendations"), eq(jobId), body.capture());
		// regionId를 주면 그 지역에서만 후보를 고른다
		assertThat(strings(body.getValue().get("candidatePlaces"), "id")).containsExactly(farCafe.toString());
		JsonNode result = data(getResult(owner, tripId, jobId).andExpect(status().isOk()));
		assertThat(result.get("insufficientData").asBoolean()).isTrue();
		assertThat(result.get("items")).isEmpty();
	}

	@Test
	void failsWhenAiRecommendsSomethingItWasNotGiven() throws Exception {
		answerWith(sent -> {
			ObjectNode data = jsonMapper.createObjectNode();
			ObjectNode place = data.putArray("items").addObject().put("type", "PLACE").put("reason", "좋아요");
			place.putNull("region");
			place.putObject("place").put("id", savedA.toString()).put("name", "모은 카페 하나");
			data.putObject("basis").put("sharedPlaceCount", 1).put("usedMemberCount", 2);
			data.put("insufficientData", false);
			return data;
		});
		UUID jobId = UUID.fromString(data(request(owner, UUID.randomUUID().toString(), "{}")
				.andExpect(status().isAccepted())).get("jobId").asString());
		runUntil(jobId, Set.of("FAILED"));
		JsonNode result = data(getResult(owner, tripId, jobId).andExpect(status().isOk()));
		assertThat(result.get("items")).isEmpty();
		assertThat(result.get("job").get("error").get("code").asString()).isNotBlank();
	}

	@Test
	void rejectsBadRequestsAndHidesOtherTripsJobs() throws Exception {
		// 키 없음 400
		mockMvc.perform(post("/api/v1/trips/{tripId}/recommendations", tripId).with(authUser(owner))
				.contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
		// 없는 지역 400, 알 수 없는 필드 400
		request(owner, UUID.randomUUID().toString(), "{\"regionId\":\"%s\"}".formatted(UUID.randomUUID()))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.fields[0].field").value("regionId"));
		request(owner, UUID.randomUUID().toString(), "{\"foo\":1}").andExpect(status().isBadRequest());
		// 멤버가 아니면 404
		UUID stranger = insertUser("남", "NONE", false);
		request(stranger, UUID.randomUUID().toString(), "{}").andExpect(status().isNotFound());
		assertThat(jdbcTemplate.queryForObject("select count(*) from jobs where trip_id = ?", Long.class, tripId)).isZero();
		verify(aiServerClient, never()).post(anyString(), any(), any());

		// 다른 여행 주소로 조회하면 404
		answerWith(sent -> {
			ObjectNode data = jsonMapper.createObjectNode();
			data.putArray("items");
			data.putObject("basis").put("sharedPlaceCount", 0).put("usedMemberCount", 0);
			data.put("insufficientData", true);
			return data;
		});
		UUID jobId = UUID.fromString(data(request(owner, UUID.randomUUID().toString(), "{}")
				.andExpect(status().isAccepted())).get("jobId").asString());
		UUID otherTrip = createTrip(owner);
		getResult(owner, otherTrip, jobId).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("JOB_NOT_FOUND"));
		// 여행 밖 사람도 404
		getResult(stranger, tripId, jobId).andExpect(status().isNotFound());
	}

	@Test
	void effectiveScopeFollowsPreferenceConsentRule() {
		assertThat(TripRecommendationSnapshot.effectiveScope("INHERIT", "EXPLICIT_ONLY", true)).isEqualTo("EXPLICIT_ONLY");
		assertThat(TripRecommendationSnapshot.effectiveScope("INHERIT", "EXPLICIT_AND_INFERRED", false)).isEqualTo("EXPLICIT_ONLY");
		assertThat(TripRecommendationSnapshot.effectiveScope("EXPLICIT_AND_INFERRED", "NONE", true)).isEqualTo("EXPLICIT_AND_INFERRED");
		assertThat(TripRecommendationSnapshot.effectiveScope("NONE", "EXPLICIT_AND_INFERRED", true)).isEqualTo("NONE");
		assertThat(TripRecommendationSnapshot.effectiveScope("EXPLICIT_ONLY", "NONE", false)).isEqualTo("EXPLICIT_ONLY");
	}

	@Test
	void documentsTheEndpoints() throws Exception {
		JsonNode docs = jsonMapper.readTree(mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString());
		assertThat(docs.at("/paths/~1api~1v1~1trips~1{tripId}~1recommendations/post/tags/0").asString()).isEqualTo("추천");
		assertThat(docs.at("/paths/~1api~1v1~1trips~1{tripId}~1recommendations/post/responses/202").isMissingNode()).isFalse();
		assertThat(docs.at("/paths/~1api~1v1~1trips~1{tripId}~1recommendations~1{jobId}/get/responses/404/description")
				.asString()).contains("JOB_NOT_FOUND");
	}

	private JsonNode candidate(JsonNode sent, UUID id) {
		for (JsonNode p : sent.get("candidatePlaces")) if (p.get("id").asString().equals(id.toString())) return p;
		throw new AssertionError("candidate not sent: " + id);
	}

	private static List<String> strings(JsonNode array) {
		List<String> values = new ArrayList<>();
		array.forEach(n -> values.add(n.asString()));
		return values;
	}

	private static List<String> strings(JsonNode array, String field) {
		List<String> values = new ArrayList<>();
		array.forEach(n -> values.add(n.get(field).asString()));
		return values;
	}

	private void answerWith(Function<JsonNode, ObjectNode> answer) {
		doAnswer(invocation -> answer.apply(invocation.getArgument(2, JsonNode.class)))
				.when(aiServerClient).post(anyString(), any(), any());
	}

	private ResultActions request(UUID userId, String key, String body) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/recommendations", tripId).with(authUser(userId))
				.header(IdempotencyService.HEADER_NAME, key).contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private ResultActions getResult(UUID userId, UUID trip, UUID jobId) throws Exception {
		return mockMvc.perform(get("/api/v1/trips/{tripId}/recommendations/{jobId}", trip, jobId).with(authUser(userId)));
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
		return jdbcTemplate.queryForObject("select status from jobs where id = ?", String.class, jobId);
	}

	private UUID createTrip(UUID userId) throws Exception {
		UUID id = UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(userId))
				.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"title\":\"바다 여행\",\"startDate\":\"2026-11-14\",\"endDate\":\"2026-11-15\"}"))
				.andExpect(status().isCreated())).get("id").asString());
		trips.add(id);
		return id;
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

	private UUID insertUser(String nickname, String scope, boolean consent) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at, preference_sharing_scope, inference_consent)
				values (?, ?, true, now(), now(), ?, ?)""", id, nickname, scope, consent);
		return id;
	}

	private void taste(UUID userId, String source, String key, int position) {
		jdbcTemplate.update("insert into user_preferences (user_id, key, value, source, position) values (?, ?, ?, ?, ?)",
				userId, key, key, source, position);
	}

	private UUID insertMember(UUID trip, UUID userId, long joinOrder) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at)
				values (?, ?, ?, 'ACTIVE', ?, now())""", id, trip, userId, joinOrder);
		return id;
	}

	private UUID insertRegion(String code, String name, UUID parent) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("insert into regions (id, code, name, parent_id) values (?, ?, ?, ?)", id, code, name, parent);
		return id;
	}

	private UUID insertPlace(String name, UUID region, String category) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into places (id, name, latitude, longitude, region_id, category, source, created_at, updated_at)
				values (?, ?, 35.1, 129.0, ?, ?, 'MANUAL', now(), now())""", id, name, region, category);
		return id;
	}

	private void save(UUID userId, UUID placeId) throws Exception {
		mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
				.put("/api/v1/trips/{tripId}/saved-places/{placeId}/me", tripId, placeId).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());
	}

}
