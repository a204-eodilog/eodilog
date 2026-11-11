package com.eodilog.itinerary.route;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

// 구간 이동 시간 다시 구하기 요청 → 작업 실행 → 코스 반영(EODI-275). AI 서버는 가짜로 바꾸고 jobs worker를 직접 돌린다.
// AI 응답은 AI MR !203의 POST /ai/v1/route-legs 형식대로 만든다. 테스트 DB는 다른 테스트와 공유해 끝날 때 내 작업을 지운다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class RouteRecalculationApiTest {

	private static final String QUERIED_AT = "2026-11-10T07:30:00.123456Z";

	@Autowired private MockMvc mockMvc;
	@Autowired private JdbcTemplate jdbcTemplate;
	@Autowired private JsonMapper jsonMapper;
	@Autowired private JobWorker worker;
	@MockitoBean private AiServerClient aiServerClient;

	private final List<UUID> trips = new ArrayList<>();
	private UUID ownerId;
	private UUID friendId;
	private UUID tripId;
	private UUID placeA;
	private UUID placeB;
	private UUID placeC;

	@BeforeEach
	void setUp() throws Exception {
		ownerId = insertUser("방장");
		friendId = insertUser("동행");
		tripId = createTrip(ownerId);
		insertMember(tripId, friendId, 2, "ACTIVE");
		placeA = insertPlace("해운대해수욕장", 35.1587, 129.1604);
		placeB = insertPlace("동백섬", 35.1531, 129.1522);
		placeC = insertPlace("광안리해수욕장", 35.1532, 129.1186);
		// 기본 AI 응답: 첫 구간은 대중교통 22분, 두 번째는 가까워 도보 5분(거리 400m)으로 돌려준다
		answerWith(sent -> legs(sent, (q, r) -> {
			if (q.get("fromOrder").asInt() == 1) {
				r.put("transportMode", "TRANSIT").put("durationSeconds", 1320).put("status", "AVAILABLE");
			} else {
				r.put("transportMode", "WALK").put("durationSeconds", 300).put("distanceMeters", 400).put("status", "AVAILABLE");
			}
		}));
	}

	@AfterEach
	void cleanUp() {
		for (UUID trip : trips) {
			jdbcTemplate.update("delete from jobs where trip_id = ?", trip);
		}
	}

	@Test
	void fillsUnavailableLegsWithoutChangingVersion() throws Exception {
		long version = writeCourse(1);
		String key = UUID.randomUUID().toString();
		UUID jobId = UUID.fromString(data(recalculate(ownerId, key, version).andExpect(status().isAccepted())
				.andExpect(jsonPath("$.data.status").value("QUEUED"))).get("jobId").asString());
		// 같은 키·같은 본문이면 새 작업을 만들지 않는다
		recalculate(ownerId, key, version).andExpect(status().isAccepted())
				.andExpect(jsonPath("$.data.jobId").value(jobId.toString()));
		assertThat(count("select count(*) from jobs where trip_id = ? and kind = 'ROUTE_RECALCULATION'", tripId)).isEqualTo(1);

		runUntil(jobId, Set.of("SUCCEEDED"));

		// AI에는 day·order·수단·양 끝 좌표만 보낸다. 항목 id는 보내지 않는다
		ArgumentCaptor<JsonNode> body = ArgumentCaptor.forClass(JsonNode.class);
		verify(aiServerClient).post(eq("/ai/v1/route-legs"), eq(jobId), body.capture());
		JsonNode sent = body.getValue();
		assertThat(sent.size()).isEqualTo(1);
		assertThat(sent.get("legs")).hasSize(2);
		JsonNode first = sent.get("legs").get(0);
		assertThat(first.get("day").asInt()).isEqualTo(1);
		assertThat(first.get("fromOrder").asInt()).isEqualTo(1);
		assertThat(first.get("toOrder").asInt()).isEqualTo(2);
		assertThat(first.get("transportMode").asString()).isEqualTo("TRANSIT");
		assertThat(first.get("from").get("latitude").asDouble()).isEqualTo(35.1587);
		assertThat(first.get("to").get("longitude").asDouble()).isEqualTo(129.1522);
		assertThat(first.has("fromItemId")).isFalse();

		// 코스: 시간이 채워지고 도보로 바뀐 구간은 WALK로 저장된다. version은 그대로다
		JsonNode course = data(getCourse(ownerId).andExpect(status().isOk()));
		assertThat(course.get("version").asLong()).isEqualTo(version);
		JsonNode legs = course.get("legs");
		assertThat(legs.get(0).get("status").asString()).isEqualTo("AVAILABLE");
		assertThat(legs.get(0).get("durationSeconds").asInt()).isEqualTo(1320);
		assertThat(legs.get(0).get("distanceMeters").isNull()).isTrue();
		assertThat(legs.get(0).get("transportMode").asString()).isEqualTo("TRANSIT");
		assertThat(legs.get(1).get("transportMode").asString()).isEqualTo("WALK");
		assertThat(legs.get(1).get("durationSeconds").asInt()).isEqualTo(300);
		assertThat(legs.get(1).get("distanceMeters").asInt()).isEqualTo(400);
		assertThat(legs.get(1).get("queriedAt").asString()).isEqualTo(QUERIED_AT);

		// 결과는 동행도 본다. 항목 id로 구간을 가리키고 좌표 입력은 내보내지 않는다
		JsonNode job = data(mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(friendId)))
				.andExpect(status().isOk()));
		JsonNode result = job.get("result");
		assertThat(result.get("baseVersion").asLong()).isEqualTo(version);
		assertThat(result.get("legs")).hasSize(2);
		assertThat(result.get("legs").get(0).get("fromItemId").asString()).isEqualTo(legs.get(0).get("fromItemId").asString());
		assertThat(result.get("legs").get(1).get("transportMode").asString()).isEqualTo("WALK");
		assertThat(result.get("legs").get(0).get("geometry").isNull()).isTrue();
		assertThat(result.toString()).doesNotContain("latitude");
		// 여행 밖 사람은 볼 수 없다
		mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(insertUser("남"))))
				.andExpect(status().isNotFound());

		// 이제 시간 없는 구간이 없으므로 다시 요청하면 422다
		recalculate(ownerId, UUID.randomUUID().toString(), version).andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.error.code").value("INSUFFICIENT_DATA"))
				.andExpect(jsonPath("$.error.fields[0].field").value("legs"));
	}

	@Test
	void keepsUnavailableResultAndDoesNotTouchChangedCourse() throws Exception {
		// AI가 첫 구간을 못 구하면 그 구간은 그대로 시간 없음이다
		answerWith(sent -> legs(sent, (q, r) -> {
			if (q.get("fromOrder").asInt() == 1) {
				// AI spec §5.1(2026-11-10): 못 구한 구간은 시간·거리 모두 null
				r.put("transportMode", "TRANSIT").putNull("durationSeconds").putNull("distanceMeters").put("status", "UNAVAILABLE");
			} else {
				// 거리를 못 읽으면 null이어도 시간은 AVAILABLE이다
				r.put("transportMode", "TRANSIT").put("durationSeconds", 600).putNull("distanceMeters").put("status", "AVAILABLE");
			}
		}));
		long version = writeCourse(1);
		UUID jobId = request(ownerId, version);
		runUntil(jobId, Set.of("SUCCEEDED"));
		JsonNode legs = data(getCourse(ownerId)).get("legs");
		assertThat(legs.get(0).get("status").asString()).isEqualTo("UNAVAILABLE");
		assertThat(legs.get(1).get("durationSeconds").asInt()).isEqualTo(600);

		// 요청 뒤 코스를 고치면(version 증가) 작업이 성공해도 코스에 반영하지 않는다
		long next = writeCourse(version);
		UUID stale = request(ownerId, next);
		long changed = writeCourse(next, "WALK");
		runUntil(stale, Set.of("SUCCEEDED"));
		JsonNode after = data(getCourse(ownerId));
		assertThat(after.get("version").asLong()).isEqualTo(changed);
		for (JsonNode leg : after.get("legs")) {
			assertThat(leg.get("status").asString()).isEqualTo("UNAVAILABLE");
			assertThat(leg.get("transportMode").asString()).isEqualTo("WALK");
		}
		JsonNode result = data(mockMvc.perform(get("/api/v1/jobs/{jobId}", stale).with(authUser(ownerId)))).get("result");
		assertThat(result.get("baseVersion").asLong()).isEqualTo(next);
	}

	@Test
	void acceptsRequestsWithoutKeyEachAsNewJob() throws Exception {
		// 키는 선택이다. 프론트는 키 없이 부른다. 키가 없으면 요청마다 작업을 만든다
		long version = writeCourse(1);
		UUID first = UUID.fromString(data(withoutKey(version).andExpect(status().isAccepted())).get("jobId").asString());
		UUID second = UUID.fromString(data(withoutKey(version).andExpect(status().isAccepted())).get("jobId").asString());
		assertThat(second).isNotEqualTo(first);
		runUntil(first, Set.of("SUCCEEDED"));
		runUntil(second, Set.of("SUCCEEDED"));
		// 두 번 돌아도 같은 값으로 채운다
		JsonNode legs = data(getCourse(ownerId)).get("legs");
		assertThat(legs.get(0).get("durationSeconds").asInt()).isEqualTo(1320);
		assertThat(legs.get(1).get("transportMode").asString()).isEqualTo("WALK");
		// 키를 보냈는데 형식이 틀리면 400이다(빈 값)
		recalculate(ownerId, "", version).andExpect(status().isBadRequest());
	}

	@Test
	void rejectsBadRequestsInOrder() throws Exception {
		long version = writeCourse(1);
		// 본문 없음·알 수 없는 필드 → 400
		send(ownerId, tripId, UUID.randomUUID().toString(), "{}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("expectedVersion"));
		send(ownerId, tripId, UUID.randomUUID().toString(), "{\"expectedVersion\":%d,\"legs\":[]}".formatted(version))
				.andExpect(status().isBadRequest());
		// 멤버가 아니면 404
		send(insertUser("남"), tripId, UUID.randomUUID().toString(), "{\"expectedVersion\":%d}".formatted(version))
				.andExpect(status().isNotFound());
		// version이 다르면 409
		recalculate(ownerId, UUID.randomUUID().toString(), version + 1).andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
		// 구간이 없는 코스(항목 하나)는 422
		long single = replaceCourse(ownerId, version, """
				[{"placeId":"%s","day":1,"order":1,"startTime":"09:00","stayMinutes":60}]""".formatted(placeA), "[]");
		recalculate(ownerId, UUID.randomUUID().toString(), single).andExpect(status().isUnprocessableContent());
		assertThat(count("select count(*) from jobs where trip_id = ?", tripId)).isZero();
		verify(aiServerClient, never()).post(anyString(), any(), any());
	}

	@Test
	void failsWhenAiBreaksTheContract() throws Exception {
		// 대중교통으로 보낸 구간을 자동차로 돌려주면 받지 않는다
		answerWith(sent -> legs(sent, (q, r) -> r.put("transportMode", "CAR").put("durationSeconds", 100).put("status", "AVAILABLE")));
		long version = writeCourse(1);
		UUID jobId = request(ownerId, version);
		runUntil(jobId, Set.of("FAILED"));
		assertCourseUntouched();

		// 구간 수가 다르면 받지 않는다
		answerWith(sent -> {
			ObjectNode data = jsonMapper.createObjectNode();
			data.putArray("legs");
			return data;
		});
		UUID second = request(ownerId, version);
		runUntil(second, Set.of("FAILED"));
		assertCourseUntouched();

		// 4xx는 다시 시도하지 않는다
		doThrow(new AiServerException(false)).when(aiServerClient).post(anyString(), any(), any());
		UUID third = request(ownerId, version);
		runUntil(third, Set.of("FAILED"));
		assertCourseUntouched();
	}

	@Test
	void cancelsWhenRequesterLeftBeforeRunning() throws Exception {
		long version = writeCourse(1);
		UUID jobId = request(friendId, version);
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where trip_id = ? and user_id = ?",
				tripId, friendId);
		runUntil(jobId, Set.of("CANCELLED"));
		verify(aiServerClient, never()).post(anyString(), any(), any());
		assertCourseUntouched();
	}

	@Test
	void documentsTheEndpoint() throws Exception {
		JsonNode docs = jsonMapper.readTree(mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString());
		JsonNode op = docs.at("/paths/~1api~1v1~1trips~1{tripId}~1itinerary~1routes~1recalculate/post");
		assertThat(op.at("/tags/0").asString()).isEqualTo("코스");
		assertThat(op.at("/responses/202").isMissingNode()).isFalse();
		assertThat(op.at("/responses/422/description").asString()).contains("INSUFFICIENT_DATA");
		assertThat(op.at("/responses/409/description").asString()).contains("VERSION_CONFLICT");
	}

	private void assertCourseUntouched() throws Exception {
		for (JsonNode leg : data(getCourse(ownerId)).get("legs")) {
			assertThat(leg.get("status").asString()).isEqualTo("UNAVAILABLE");
			assertThat(leg.get("durationSeconds").isNull()).isTrue();
		}
	}

	// 1일차 A→B→C, 구간은 모두 대중교통. PUT은 구간 시간을 비운다
	private long writeCourse(long expectedVersion) throws Exception {
		return writeCourse(expectedVersion, "TRANSIT");
	}

	private long writeCourse(long expectedVersion, String mode) throws Exception {
		return replaceCourse(ownerId, expectedVersion, """
				[{"placeId":"%s","day":1,"order":1,"startTime":"09:00","stayMinutes":60},
				 {"placeId":"%s","day":1,"order":2,"startTime":"11:00","stayMinutes":60},
				 {"placeId":"%s","day":1,"order":3,"startTime":"13:00","stayMinutes":60}]""".formatted(placeA, placeB, placeC),
				"""
				[{"day":1,"fromOrder":1,"toOrder":2,"transportMode":"%1$s"},
				 {"day":1,"fromOrder":2,"toOrder":3,"transportMode":"%1$s"}]""".formatted(mode));
	}

	private long replaceCourse(UUID userId, long expectedVersion, String items, String legs) throws Exception {
		return data(mockMvc.perform(put("/api/v1/trips/{tripId}/itinerary", tripId).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"expectedVersion\":%d,\"items\":%s,\"legs\":%s}".formatted(expectedVersion, items, legs)))
				.andExpect(status().isOk())).get("version").asLong();
	}

	private interface LegAnswer {
		void fill(JsonNode query, ObjectNode result);
	}

	// 보낸 구간과 같은 순서로 day·order·queriedAt을 채운 응답
	private ObjectNode legs(JsonNode sent, LegAnswer answer) {
		ObjectNode data = jsonMapper.createObjectNode();
		ArrayNode legs = data.putArray("legs");
		for (JsonNode q : sent.get("legs")) {
			ObjectNode r = legs.addObject().put("day", q.get("day").asInt()).put("fromOrder", q.get("fromOrder").asInt())
					.put("toOrder", q.get("toOrder").asInt()).put("queriedAt", QUERIED_AT);
			answer.fill(q, r);
		}
		return data;
	}

	private void answerWith(Function<JsonNode, ObjectNode> answer) {
		doAnswer(invocation -> answer.apply(invocation.getArgument(2, JsonNode.class)))
				.when(aiServerClient).post(anyString(), any(), any());
	}

	private UUID request(UUID userId, long version) throws Exception {
		return UUID.fromString(data(recalculate(userId, UUID.randomUUID().toString(), version)
				.andExpect(status().isAccepted())).get("jobId").asString());
	}

	private ResultActions withoutKey(long version) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/routes/recalculate", tripId).with(authUser(ownerId))
				.contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":%d}".formatted(version)));
	}

	private ResultActions recalculate(UUID userId, String key, long version) throws Exception {
		return send(userId, tripId, key, "{\"expectedVersion\":%d}".formatted(version));
	}

	private ResultActions send(UUID userId, UUID trip, String key, String body) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/routes/recalculate", trip).with(authUser(userId))
				.header(IdempotencyService.HEADER_NAME, key).contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private ResultActions getCourse(UUID userId) throws Exception {
		return mockMvc.perform(get("/api/v1/trips/{tripId}/itinerary", tripId).with(authUser(userId)));
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
				.content("{\"title\":\"부산\",\"startDate\":\"2026-11-14\",\"endDate\":\"2026-11-15\"}"))
				.andExpect(status().isCreated())).get("id").asString());
		trips.add(id);
		return id;
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

	private long count(String sql, Object... args) {
		return jdbcTemplate.queryForObject(sql, Long.class, args);
	}

	private UUID insertUser(String nickname) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("insert into users (id, nickname, profile_completed, created_at, updated_at) values (?, ?, true, now(), now())",
				id, nickname);
		return id;
	}

	private void insertMember(UUID trip, UUID userId, long joinOrder, String status) {
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at, left_at)
				values (?, ?, ?, ?, ?, now(), case when ? = 'ACTIVE' then null else now() end)""",
				UUID.randomUUID(), trip, userId, status, joinOrder, status);
	}

	private UUID insertPlace(String name, double latitude, double longitude) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("insert into places (id, name, latitude, longitude, source, created_at, updated_at) values (?, ?, ?, ?, 'MANUAL', now(), now())",
				id, name, latitude, longitude);
		return id;
	}

}
