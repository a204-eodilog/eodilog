package com.eodilog.checklist.suggestion;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.ai.AiServerClient;
import com.eodilog.global.ai.AiServerException;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.job.JobWorker;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
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
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

// AI 준비물 추천 요청 → 작업 실행 → 결과 조회 → 채택(EODI-218). AI 서버는 가짜로 바꾸고 실제 jobs worker를 직접 돌린다
// 테스트 DB는 다른 테스트 클래스와 공유한다. JobIntegrationTest가 jobs를 지우므로 끝날 때 내 AI 준비물과 작업을 지운다(정책 S-19·S-20)
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ChecklistSuggestionApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	@Autowired
	private JobWorker worker;

	@MockitoBean
	private AiServerClient aiServerClient;

	private UUID ownerId;
	private UUID friendId;
	private UUID tripId;

	@BeforeEach
	void setUp() throws Exception {
		ownerId = insertUser("방장");
		friendId = insertUser("동행");
		tripId = createTrip(ownerId);
		insertMember(tripId, friendId, 2, "ACTIVE");
		answerWith("우산", "우비");
	}

	@AfterEach
	void cleanUp() {
		jdbcTemplate.update("delete from checklist_items where source = 'AI'");
		jdbcTemplate.update("delete from jobs where kind = 'CHECKLIST_SUGGESTIONS'");
	}

	@Test
	void requestsSuggestionsRunsJobAndAdoptsChosenOnes() throws Exception {
		UUID placeId = insertPlace("해운대해수욕장");
		insertItineraryItem(tripId, placeId, 1, 1, "10:00", 120);
		addItem(ownerId, tripId, "{\"label\":\"충전기\"}").andExpect(status().isCreated());
		UUID deletedId = id(addItem(ownerId, tripId, "{\"label\":\"손수건\"}"));
		mockMvc.perform(delete("/api/v1/trips/{tripId}/checklist/{itemId}", tripId, deletedId).with(authUser(ownerId)))
				.andExpect(status().isNoContent());

		String key = UUID.randomUUID().toString();
		JsonNode ref = data(requestSuggestions(ownerId, tripId, key, null)
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.data.status").value("QUEUED")));
		UUID jobId = UUID.fromString(ref.get("jobId").asString());
		assertThat(ref.get("statusUrl").asString()).isEqualTo("/api/v1/jobs/" + jobId);
		// 같은 키로 다시 보내면 새 작업을 만들지 않고 처음 접수를 돌려준다. 본문 {}도 같은 요청이다
		requestSuggestions(ownerId, tripId, key, "{}")
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.data.jobId").value(jobId.toString()));
		assertThat(count("select count(*) from jobs where trip_id = ? and kind = 'CHECKLIST_SUGGESTIONS'", tripId))
				.isEqualTo(1);

		runUntil(jobId, Set.of("SUCCEEDED"));

		// AI에 보낸 입력: 등록 때 고정한 여행 기간·코스·현재/지운 준비물, jobId, 빈 날씨
		ArgumentCaptor<JsonNode> body = ArgumentCaptor.forClass(JsonNode.class);
		verify(aiServerClient).post(eq("/ai/v1/checklist-suggestions"), eq(jobId), body.capture());
		JsonNode sent = body.getValue();
		assertThat(sent.get("jobId").asString()).isEqualTo(jobId.toString());
		assertThat(sent.get("trip").get("startDate").asString()).isEqualTo("2026-11-14");
		assertThat(sent.get("trip").get("endDate").asString()).isEqualTo("2026-11-15");
		assertThat(sent.get("weather").isArray()).isTrue();
		assertThat(sent.get("weather").size()).isZero();
		assertThat(sent.get("items").get(0).get("place").get("name").asString()).isEqualTo("해운대해수욕장");
		assertThat(sent.get("items").get(0).get("place").get("id").asString()).isEqualTo(placeId.toString());
		assertThat(sent.get("items").get(0).get("day").asInt()).isEqualTo(1);
		assertThat(sent.get("items").get(0).get("startTime").asString()).isEqualTo("10:00");
		assertThat(sent.get("items").get(0).get("stayMinutes").asInt()).isEqualTo(120);
		assertThat(sent.get("existingItems").size()).isEqualTo(1);
		assertThat(sent.get("existingItems").get(0).get("label").asString()).isEqualTo("충전기");
		assertThat(sent.get("existingItems").get(0).get("source").asString()).isEqualTo("MANUAL");
		assertThat(sent.get("deletedLabels").size()).isEqualTo(1);
		assertThat(sent.get("deletedLabels").get(0).asString()).isEqualTo("손수건");

		// 공동 목록이므로 요청하지 않은 멤버도 결과를 본다
		getJob(friendId, jobId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.kind").value("CHECKLIST_SUGGESTIONS"))
				.andExpect(jsonPath("$.data.status").value("SUCCEEDED"))
				.andExpect(jsonPath("$.data.error").isEmpty())
				.andExpect(jsonPath("$.data.result.items", hasSize(2)))
				.andExpect(jsonPath("$.data.result.items[0].label").value("우산"))
				.andExpect(jsonPath("$.data.result.items[0].reason").value("우산 이유"))
				.andExpect(jsonPath("$.data.result.items[0].sourceJobId").value(jobId.toString()));

		adopt(friendId, "우산", jobId, 0)
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.label").value("우산"))
				.andExpect(jsonPath("$.data.source").value("AI"))
				.andExpect(jsonPath("$.data.sourceJobId").value(jobId.toString()))
				.andExpect(jsonPath("$.data.reason").value("우산 이유"))
				.andExpect(jsonPath("$.data.modifiedByUser").value(false))
				.andExpect(jsonPath("$.data.checked").value(false))
				.andExpect(jsonPath("$.data.version").value(1));
		expectAlreadyAdopted(adopt(ownerId, "우산", jobId, 0));

		// 이름을 고쳐 채택하면 고친 항목으로 표시하고 이유는 제안의 것을 남긴다
		UUID renamedId = id(adopt(ownerId, "작은 우비", jobId, 1)
				.andExpect(jsonPath("$.data.modifiedByUser").value(true))
				.andExpect(jsonPath("$.data.reason").value("우비 이유")));
		// 채택 후 지운 제안도 다시 채택해 되살리지 않는다
		mockMvc.perform(delete("/api/v1/trips/{tripId}/checklist/{itemId}", tripId, renamedId).with(authUser(ownerId)))
				.andExpect(status().isNoContent());
		expectAlreadyAdopted(adopt(ownerId, "우비", jobId, 1));

		assertThat(count("select count(*) from checklist_items where trip_id = ? and source = 'AI'", tripId))
				.isEqualTo(2);
		assertThat(jdbcTemplate.queryForObject("select suggestion_index from checklist_items where id = ?",
				Integer.class, renamedId)).isEqualTo(1);
	}

	@Test
	void rejectsRequestsBeforeQueueing() throws Exception {
		expectValidationError(requestSuggestions(ownerId, tripId, null, null), IdempotencyService.HEADER_NAME);
		// 예전 명세의 date 등 받지 않는 필드는 400이다(정책 S-22)
		requestSuggestions(ownerId, tripId, UUID.randomUUID().toString(), "{\"date\":\"2026-11-14\"}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

		UUID strangerId = insertUser("남");
		requestSuggestions(strangerId, tripId, UUID.randomUUID().toString(), null)
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where trip_id = ? and user_id = ?",
				tripId, friendId);
		requestSuggestions(friendId, tripId, UUID.randomUUID().toString(), null)
				.andExpect(status().isNotFound());

		setChecklistMode(ownerId, "OFF");
		requestSuggestions(ownerId, tripId, UUID.randomUUID().toString(), null)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("AI_FEATURE_DISABLED"));

		assertThat(count("select count(*) from jobs where trip_id = ?", tripId)).isZero();
		verify(aiServerClient, never()).post(anyString(), any(), any());
	}

	@Test
	void autoModeOnlySuggestsLikeConfirm() throws Exception {
		// 자동 반영 기준이 정해지기 전이라 AUTO도 제안만 만든다(정책 S-12)
		setChecklistMode(ownerId, "AUTO");
		UUID jobId = request(ownerId);
		runUntil(jobId, Set.of("SUCCEEDED"));
		assertThat(count("select count(*) from checklist_items where trip_id = ?", tripId)).isZero();
	}

	@Test
	void retriesTemporaryFailureAndFailsOnRejectedOrMalformedResponse() throws Exception {
		doThrow(new AiServerException(true)).when(aiServerClient).post(anyString(), any(), any());
		UUID temporary = request(ownerId);
		runUntilFailureRecorded(temporary);
		// 일시 실패는 다음 시도를 기다리는 QUEUED로 돌아가고, 직전 오류는 공개하지 않는다
		assertThat(state(temporary)).isEqualTo("QUEUED");
		assertThat(jdbcTemplate.queryForObject("select error_code from jobs where id = ?", String.class, temporary))
				.isEqualTo("TEMPORARY_FAILURE");
		getJob(ownerId, temporary).andExpect(jsonPath("$.data.error").isEmpty());

		doThrow(new AiServerException(false)).when(aiServerClient).post(anyString(), any(), any());
		UUID rejected = request(ownerId);
		runUntil(rejected, Set.of("FAILED"));
		getJob(ownerId, rejected)
				.andExpect(jsonPath("$.data.status").value("FAILED"))
				.andExpect(jsonPath("$.data.error.code").value("EXECUTION_FAILED"))
				.andExpect(jsonPath("$.data.result").isEmpty());

		// 다른 작업의 sourceJobId가 섞인 응답은 저장하지 않는다
		doAnswer(invocation -> suggestions(UUID.randomUUID(), "우산"))
				.when(aiServerClient).post(anyString(), any(), any());
		UUID malformed = request(ownerId);
		runUntil(malformed, Set.of("FAILED"));
		assertThat(jdbcTemplate.queryForObject("select result_json::text from jobs where id = ?", String.class,
				malformed)).isNull();
		expectInvalid(adopt(ownerId, "우산", malformed, 0), "sourceJobId");
	}

	@Test
	void treatsEmptySuggestionsAsSuccess() throws Exception {
		answerWith();
		UUID jobId = request(ownerId);
		runUntil(jobId, Set.of("SUCCEEDED"));
		getJob(ownerId, jobId).andExpect(jsonPath("$.data.result.items", hasSize(0)));
		expectInvalid(adopt(ownerId, "우산", jobId, 0), "suggestionIndex");
	}

	@Test
	void cancelsWhenRequesterLeavesOrTurnsOffBeforeExecution() throws Exception {
		UUID leaving = request(friendId);
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where trip_id = ? and user_id = ?",
				tripId, friendId);
		runUntil(leaving, Set.of("CANCELLED"));
		// 요청자라도 나가면 결과를 볼 수 없다. 남은 멤버는 취소 상태를 본다
		getJob(friendId, leaving).andExpect(status().isNotFound());
		getJob(ownerId, leaving)
				.andExpect(jsonPath("$.data.status").value("CANCELLED"))
				.andExpect(jsonPath("$.data.error.code").value("POLICY_REVOKED"));

		UUID turnedOff = request(ownerId);
		setChecklistMode(ownerId, "OFF");
		runUntil(turnedOff, Set.of("CANCELLED"));
		verify(aiServerClient, never()).post(anyString(), any(), any());
	}

	@Test
	void hidesResultFromNonMembers() throws Exception {
		UUID jobId = request(ownerId);
		runUntil(jobId, Set.of("SUCCEEDED"));
		UUID strangerId = insertUser("남");
		getJob(strangerId, jobId)
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("JOB_NOT_FOUND"));
		jdbcTemplate.update("update trips set deleted_at = now() where id = ?", tripId);
		getJob(ownerId, jobId).andExpect(status().isNotFound());
	}

	@Test
	void rejectsInvalidAdoptions() throws Exception {
		UUID jobId = request(ownerId);
		// 아직 실행 전(QUEUED)인 작업의 제안은 채택할 수 없다
		expectInvalid(adopt(ownerId, "우산", jobId, 0), "sourceJobId");
		runUntil(jobId, Set.of("SUCCEEDED"));

		expectInvalid(addItem(ownerId, tripId, "{\"label\":\"우산\",\"sourceJobId\":\"%s\"}".formatted(jobId)),
				"suggestionIndex");
		expectInvalid(addItem(ownerId, tripId, "{\"label\":\"우산\",\"suggestionIndex\":0}"), "sourceJobId");
		expectInvalid(adopt(ownerId, "우산", jobId, -1), "suggestionIndex");
		expectInvalid(adopt(ownerId, "우산", jobId, 2), "suggestionIndex");
		expectInvalid(adopt(ownerId, "우산", UUID.randomUUID(), 0), "sourceJobId");

		// 다른 여행의 작업은 그 여행의 멤버라도 이 여행에 채택할 수 없다
		UUID otherTripId = createTrip(ownerId);
		expectInvalid(addItem(ownerId, otherTripId,
				"{\"label\":\"우산\",\"sourceJobId\":\"%s\",\"suggestionIndex\":0}".formatted(jobId)), "sourceJobId");
		// 다른 종류의 작업도 받지 않는다
		UUID otherKind = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into jobs (id, requested_by_user_id, trip_id, kind, status, input_json, result_json,
				    next_attempt_at, created_at, finished_at)
				values (?, ?, ?, 'TRIP_RECOMMENDATION', 'SUCCEEDED', '{}'::jsonb, ?::jsonb, now(), now(), now())""",
				otherKind, ownerId, tripId, suggestions(otherKind, "우산").toString());
		try {
			expectInvalid(adopt(ownerId, "우산", otherKind, 0), "sourceJobId");
		} finally {
			jdbcTemplate.update("delete from jobs where id = ?", otherKind);
		}

		UUID strangerId = insertUser("남");
		adopt(strangerId, "우산", jobId, 0).andExpect(status().isNotFound());

		setChecklistMode(friendId, "OFF");
		adopt(friendId, "우산", jobId, 0)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("AI_FEATURE_DISABLED"));
		assertThat(count("select count(*) from checklist_items where source = 'AI' and trip_id = ?", tripId)).isZero();
	}

	@Test
	void letsOnlyOneConcurrentAdoptionOfSameSuggestionSucceed() throws Exception {
		UUID jobId = request(ownerId);
		runUntil(jobId, Set.of("SUCCEEDED"));

		int attempts = 4;
		CountDownLatch ready = new CountDownLatch(attempts);
		CountDownLatch start = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(attempts);
		try {
			List<Future<Integer>> results = new ArrayList<>();
			for (int i = 0; i < attempts; i++) {
				UUID userId = i % 2 == 0 ? ownerId : friendId;
				results.add(executor.submit(() -> {
					ready.countDown();
					start.await();
					return adopt(userId, "우산", jobId, 0).andReturn().getResponse().getStatus();
				}));
			}
			ready.await();
			start.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> result : results) {
				statuses.add(result.get(30, TimeUnit.SECONDS));
			}
			assertThat(statuses).containsOnlyOnce(201);
			assertThat(statuses.stream().filter(status -> status == 409).count()).isEqualTo(attempts - 1);
		} finally {
			executor.shutdownNow();
		}
		assertThat(count("select count(*) from checklist_items where source_job_id = ?", jobId)).isEqualTo(1);
	}

	@Test
	void documentsSuggestionApi() throws Exception {
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/checklist-suggestions'].post.tags[0]").value("준비물"))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/checklist-suggestions'].post.responses['202']")
						.exists())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/checklist-suggestions'].post.responses['409'].description")
						.value(containsString("AI_FEATURE_DISABLED")))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/checklist'].post.responses['409'].description")
						.value(containsString("SUGGESTION_ALREADY_ADOPTED")));
	}

	private void answerWith(String... labels) {
		// 이미 정한 응답을 바꿀 때 when(...)은 기존 응답을 한 번 부르므로 doAnswer를 쓴다
		doAnswer(invocation -> suggestions(invocation.getArgument(1, UUID.class), labels))
				.when(aiServerClient).post(anyString(), any(), any());
	}

	private ObjectNode suggestions(UUID jobId, String... labels) {
		ObjectNode data = jsonMapper.createObjectNode();
		ArrayNode items = data.putArray("items");
		for (String label : labels) {
			items.addObject().put("label", label).put("reason", label + " 이유").put("sourceJobId", jobId.toString());
		}
		return data;
	}

	private UUID request(UUID userId) throws Exception {
		JsonNode ref = data(requestSuggestions(userId, tripId, UUID.randomUUID().toString(), null)
				.andExpect(status().isAccepted()));
		return UUID.fromString(ref.get("jobId").asString());
	}

	// 다른 테스트가 남긴 작업이 먼저 선점될 수 있으므로 내 작업이 원하는 상태가 될 때까지 선점을 반복한다
	private void runUntil(UUID jobId, Set<String> expected) {
		long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
		while (!expected.contains(state(jobId)) && System.nanoTime() < until) {
			if (!state(jobId).equals("QUEUED") || !worker.pollOnce()) {
				LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(10));
			}
		}
		assertThat(state(jobId)).isIn(expected);
	}

	// 일시 실패는 30초 뒤 다시 시도하도록 QUEUED로 돌아간다. 첫 시도가 기록될 때까지만 돌린다
	private void runUntilFailureRecorded(UUID jobId) {
		long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
		while (count("select count(*) from jobs where id = ? and attempt = 1 and status = 'QUEUED'", jobId) == 0
				&& System.nanoTime() < until) {
			if (!state(jobId).equals("QUEUED") || !worker.pollOnce()) {
				LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(10));
			}
		}
		assertThat(count("select count(*) from jobs where id = ? and attempt = 1", jobId)).isEqualTo(1);
	}

	private String state(UUID jobId) {
		return jdbcTemplate.queryForObject("select status from jobs where id = ?", String.class, jobId);
	}

	private void expectValidationError(ResultActions result, String field) throws Exception {
		result.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields[0].field").value(field));
	}

	private void expectInvalid(ResultActions result, String field) throws Exception {
		expectValidationError(result, field);
	}

	private void expectAlreadyAdopted(ResultActions result) throws Exception {
		result.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("SUGGESTION_ALREADY_ADOPTED"));
	}

	private ResultActions requestSuggestions(UUID userId, UUID tripId, String key, String body) throws Exception {
		var request = post("/api/v1/trips/{tripId}/checklist-suggestions", tripId).with(authUser(userId));
		if (key != null) {
			request.header(IdempotencyService.HEADER_NAME, key);
		}
		if (body != null) {
			request.contentType(MediaType.APPLICATION_JSON).content(body);
		}
		return mockMvc.perform(request);
	}

	private ResultActions getJob(UUID userId, UUID jobId) throws Exception {
		return mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(userId)));
	}

	private ResultActions adopt(UUID userId, String label, UUID jobId, int index) throws Exception {
		return addItem(userId, tripId, "{\"label\":\"%s\",\"sourceJobId\":\"%s\",\"suggestionIndex\":%d}"
				.formatted(label, jobId, index));
	}

	private ResultActions addItem(UUID userId, UUID tripId, String body) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/checklist", tripId).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content(body));
	}

	private UUID createTrip(UUID userId) throws Exception {
		return id(mockMvc.perform(post("/api/v1/trips").with(authUser(userId))
				.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"title\":\"부산\",\"startDate\":\"2026-11-14\",\"endDate\":\"2026-11-15\"}")));
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

	private UUID id(ResultActions result) throws Exception {
		return UUID.fromString(data(result.andExpect(status().isCreated())).get("id").asString());
	}

	private long count(String sql, Object... args) {
		return jdbcTemplate.queryForObject(sql, Long.class, args);
	}

	private void setChecklistMode(UUID userId, String mode) {
		jdbcTemplate.update("""
				insert into user_settings (user_id, checklist_mode) values (?, ?)
				on conflict (user_id) do update set checklist_mode = excluded.checklist_mode""", userId, mode);
	}

	private UUID insertUser(String nickname) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, ?, true, now(), now())""", id, nickname);
		return id;
	}

	private void insertMember(UUID tripId, UUID userId, long joinOrder, String status) {
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at, left_at)
				values (?, ?, ?, ?, ?, now(), case when ? = 'ACTIVE' then null else now() end)""",
				UUID.randomUUID(), tripId, userId, status, joinOrder, status);
	}

	private UUID insertPlace(String name) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into places (id, name, latitude, longitude, source, created_at, updated_at)
				values (?, ?, 35.1587, 129.1604, 'MANUAL', now(), now())""", id, name);
		return id;
	}

	private void insertItineraryItem(UUID tripId, UUID placeId, int day, int sequence, String startTime,
			int stayMinutes) {
		jdbcTemplate.update("""
				insert into itinerary_items (id, itinerary_id, place_id, day, sequence, start_time, stay_minutes)
				select ?, id, ?, ?, ?, ?, ? from itineraries where trip_id = ?""",
				UUID.randomUUID(), placeId, day, sequence, startTime, stayMinutes, tripId);
	}

}
