package com.eodilog.trip.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.trip.domain.TripInfoChangedEvent;
import com.eodilog.trip.domain.TripStatusPolicy;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 실제 커밋과 동시 수정을 확인해야 하므로 테스트 트랜잭션을 쓰지 않는다. 테스트마다 새 사용자로 자료를 구분한다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@RecordApplicationEvents
class TripUpdateApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	@Autowired
	private ApplicationEvents events;

	private UUID ownerId;

	@BeforeEach
	void setUp() {
		ownerId = insertUser("방장");
	}

	@Test
	void updatesTitlePeriodAndDestinations() throws Exception {
		UUID busan = insertRegion();
		UUID jeju = insertRegion();
		UUID tripId = id(createTrip("{\"title\":\"제주\",\"destinationRegionIds\":[\"%s\"]}".formatted(jeju)));
		LocalDate start = today().plusMonths(1);

		JsonNode updated = data(updateTrip(ownerId, tripId, """
				{"expectedVersion":1,"title":"  남쪽 여행  ","startDate":"%s","endDate":"%s","destinationRegionIds":["%s","%s"]}
				""".formatted(start, start.plusDays(2), busan, jeju))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.title").value("남쪽 여행"))
				.andExpect(jsonPath("$.data.startDate").value(start.toString()))
				.andExpect(jsonPath("$.data.endDate").value(start.plusDays(2).toString()))
				.andExpect(jsonPath("$.data.destinationRegionIds[0]").value(busan.toString()))
				.andExpect(jsonPath("$.data.destinationRegionIds[1]").value(jeju.toString()))
				.andExpect(jsonPath("$.data.status").value("PLANNING"))
				.andExpect(jsonPath("$.data.version").value(2)));

		assertThat(data(getTrip(ownerId, tripId))).isEqualTo(updated);
		List<TripInfoChangedEvent> published = events.stream(TripInfoChangedEvent.class).toList();
		assertThat(published).hasSize(1);
		assertThat(published.getFirst().changedFields())
				.containsExactly("title", "startDate", "endDate", "destinationRegionIds");
		assertThat(published.getFirst().version()).isEqualTo(2);
		assertThat(published.getFirst().actorUserId()).isEqualTo(ownerId);
	}

	@Test
	void keepsOmittedFields() throws Exception {
		UUID jeju = insertRegion();
		LocalDate start = today().plusMonths(1);
		UUID tripId = id(createTrip("""
				{"title":"제주","startDate":"%s","endDate":"%s","destinationRegionIds":["%s"]}
				""".formatted(start, start.plusDays(1), jeju)));

		updateTrip(ownerId, tripId, "{\"expectedVersion\":1,\"title\":\"제주 다시\"}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.title").value("제주 다시"))
				.andExpect(jsonPath("$.data.startDate").value(start.toString()))
				.andExpect(jsonPath("$.data.destinationRegionIds[0]").value(jeju.toString()));
		assertThat(events.stream(TripInfoChangedEvent.class).toList().getFirst().changedFields())
				.containsExactly("title");
	}

	@Test
	void clearsPeriodWithNullAndDestinationsWithEmptyArray() throws Exception {
		LocalDate start = today().minusDays(10);
		UUID tripId = id(createTrip("""
				{"title":"제주","startDate":"%s","endDate":"%s","destinationRegionIds":["%s"]}
				""".formatted(start, start.plusDays(1), insertRegion())));

		updateTrip(ownerId, tripId, "{\"expectedVersion\":1,\"startDate\":null,\"endDate\":null,\"destinationRegionIds\":[]}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.startDate").isEmpty())
				.andExpect(jsonPath("$.data.endDate").isEmpty())
				.andExpect(jsonPath("$.data.destinationRegionIds", hasSize(0)))
				.andExpect(jsonPath("$.data.status").value("PLANNING"));
		assertThat(count("select count(*) from trip_destinations where trip_id = ?", tripId)).isZero();
	}

	@Test
	void recalculatesAndStoresStatus() throws Exception {
		UUID tripId = id(createTrip("{\"title\":\"제주\"}"));

		updateTrip(ownerId, tripId, """
				{"expectedVersion":1,"startDate":"%s","endDate":"%s"}""".formatted(today().minusDays(3), today().minusDays(1)))
				.andExpect(jsonPath("$.data.status").value("COMPLETED"));
		assertThat(jdbcTemplate.queryForObject("select status from trips where id = ?", String.class, tripId))
				.isEqualTo("COMPLETED");
	}

	@Test
	void rejectsPeriodThatBecomesOneSidedAfterMerge() throws Exception {
		LocalDate start = today().plusMonths(1);
		UUID tripId = id(createTrip(period("제주", start, start.plusDays(1))));

		updateTrip(ownerId, tripId, "{\"expectedVersion\":1,\"startDate\":null}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("startDate"));
		updateTrip(ownerId, tripId, "{\"expectedVersion\":1,\"endDate\":\"%s\"}".formatted(start.minusDays(1)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("endDate"));
		assertThat(version(tripId)).isEqualTo(1);
	}

	@Test
	void rejectsInvalidRequests() throws Exception {
		UUID tripId = id(createTrip("{\"title\":\"제주\"}"));
		UUID jeju = insertRegion();

		updateTrip(ownerId, tripId, "{\"title\":\"부산\"}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("expectedVersion"));
		updateTrip(ownerId, tripId, "{\"expectedVersion\":1,\"title\":null}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("title"));
		updateTrip(ownerId, tripId, "{\"expectedVersion\":1,\"title\":\"%s\"}".formatted("가".repeat(201)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("title"));
		updateTrip(ownerId, tripId, "{\"expectedVersion\":1,\"destinationRegionIds\":null}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("destinationRegionIds"));
		updateTrip(ownerId, tripId, "{\"expectedVersion\":1,\"destinationRegionIds\":[\"%s\",\"%s\"]}".formatted(jeju, jeju))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("destinationRegionIds"));
		updateTrip(ownerId, tripId, "{\"expectedVersion\":1,\"status\":\"COMPLETED\"}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("status"));
		updateTrip(ownerId, tripId, "{\"expectedVersion\":1,\"currency\":\"USD\"}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("currency"));
		assertThat(version(tripId)).isEqualTo(1);
	}

	@Test
	void rejectsStaleVersionWithoutOverwriting() throws Exception {
		UUID tripId = id(createTrip("{\"title\":\"제주\"}"));
		updateTrip(ownerId, tripId, "{\"expectedVersion\":1,\"title\":\"먼저 고친 이름\"}").andExpect(status().isOk());

		updateTrip(ownerId, tripId, "{\"expectedVersion\":1,\"title\":\"늦게 고친 이름\"}")
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));

		getTrip(ownerId, tripId)
				.andExpect(jsonPath("$.data.title").value("먼저 고친 이름"))
				.andExpect(jsonPath("$.data.version").value(2));
	}

	@Test
	void keepsVersionWhenNothingChanged() throws Exception {
		UUID tripId = id(createTrip("{\"title\":\"제주\",\"destinationRegionIds\":[\"%s\"]}".formatted(insertRegion())));
		Timestamp updatedAt = updatedAt(tripId);
		List<String> regionIds = jdbcTemplate.queryForList(
				"select region_id::text from trip_destinations where trip_id = ?", String.class, tripId);

		updateTrip(ownerId, tripId, """
				{"expectedVersion":1,"title":" 제주 ","startDate":null,"endDate":null,"destinationRegionIds":["%s"]}
				""".formatted(regionIds.getFirst()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(1));
		updateTrip(ownerId, tripId, "{\"expectedVersion\":1}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(1));

		assertThat(events.stream(TripInfoChangedEvent.class)).isEmpty();
		assertThat(updatedAt(tripId)).isEqualTo(updatedAt);
	}

	@Test
	void letsAnyActiveMemberEditButHidesTripFromOthers() throws Exception {
		UUID tripId = id(createTrip("{\"title\":\"제주\"}"));
		UUID friendId = insertUser("동행");
		UUID leaverId = insertUser("나간 동행");
		UUID strangerId = insertUser("모르는 사람");
		insertMember(tripId, friendId, 2, "ACTIVE");
		insertMember(tripId, leaverId, 3, "LEFT");

		updateTrip(friendId, tripId, "{\"expectedVersion\":1,\"title\":\"동행이 고친 이름\"}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.title").value("동행이 고친 이름"));
		expectTripNotFound(updateTrip(strangerId, tripId, "{\"expectedVersion\":2,\"title\":\"x\"}"));
		expectTripNotFound(updateTrip(leaverId, tripId, "{\"expectedVersion\":2,\"title\":\"x\"}"));
		expectTripNotFound(updateTrip(ownerId, UUID.randomUUID(), "{\"expectedVersion\":1,\"title\":\"x\"}"));

		jdbcTemplate.update("update trips set deleted_at = now() where id = ?", tripId);
		expectTripNotFound(updateTrip(ownerId, tripId, "{\"expectedVersion\":2,\"title\":\"x\"}"));
	}

	@Test
	void letsOnlyOneConcurrentEditWithSameVersionSucceed() throws Exception {
		UUID tripId = id(createTrip("{\"title\":\"제주\"}"));
		List<String> titles = List.of("A안", "B안", "C안", "D안");
		CountDownLatch ready = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(titles.size());
		List<Future<MockHttpServletResponse>> futures = new ArrayList<>();
		try {
			for (String title : titles) {
				futures.add(executor.submit(() -> {
					ready.await();
					return updateTrip(ownerId, tripId, "{\"expectedVersion\":1,\"title\":\"%s\"}".formatted(title))
							.andReturn().getResponse();
				}));
			}
			ready.countDown();

			List<String> winners = new ArrayList<>();
			for (Future<MockHttpServletResponse> future : futures) {
				MockHttpServletResponse response = future.get();
				assertThat(response.getStatus()).isIn(200, 409);
				if (response.getStatus() == 200) {
					winners.add(jsonMapper.readTree(response.getContentAsString()).get("data").get("title").asString());
				}
			}
			assertThat(winners).hasSize(1);
			getTrip(ownerId, tripId)
					.andExpect(jsonPath("$.data.title").value(winners.getFirst()))
					.andExpect(jsonPath("$.data.version").value(2));
		} finally {
			executor.shutdownNow();
		}
	}

	@Test
	void documentsUpdateApi() throws Exception {
		JsonNode docs = jsonMapper.readTree(mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}'].patch.tags[0]").value("여행"))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}'].patch.responses['409'].description")
						.value(containsString("VERSION_CONFLICT")))
				.andReturn().getResponse().getContentAsString());

		// 보낸 필드를 기록하는 내부 값(sentTitle 등)은 문서에 드러나지 않아야 한다
		assertThat(docs.get("components").get("schemas").get("UpdateTripRequest").get("properties").propertyNames())
				.containsExactlyInAnyOrder("expectedVersion", "title", "startDate", "endDate", "destinationRegionIds");
	}

	private void expectTripNotFound(ResultActions result) throws Exception {
		result.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
	}

	private JsonNode createTrip(String body) throws Exception {
		return data(mockMvc.perform(post("/api/v1/trips").with(authUser(ownerId)).with(csrf())
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isCreated()));
	}

	private ResultActions updateTrip(UUID userId, UUID tripId, String body) throws Exception {
		return mockMvc.perform(patch("/api/v1/trips/{tripId}", tripId).with(authUser(userId)).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(body));
	}

	private ResultActions getTrip(UUID userId, UUID tripId) throws Exception {
		return mockMvc.perform(get("/api/v1/trips/{tripId}", tripId).with(authUser(userId)));
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

	private UUID id(JsonNode trip) {
		return UUID.fromString(trip.get("id").asString());
	}

	private long version(UUID tripId) {
		return jdbcTemplate.queryForObject("select version from trips where id = ?", Long.class, tripId);
	}

	private Timestamp updatedAt(UUID tripId) {
		return jdbcTemplate.queryForObject("select updated_at from trips where id = ?", Timestamp.class, tripId);
	}

	private long count(String sql, Object... args) {
		return jdbcTemplate.queryForObject(sql, Long.class, args);
	}

	private String period(String title, LocalDate start, LocalDate end) {
		return "{\"title\":\"%s\",\"startDate\":\"%s\",\"endDate\":\"%s\"}".formatted(title, start, end);
	}

	private LocalDate today() {
		return LocalDate.now(TripStatusPolicy.SERVICE_ZONE);
	}

	private UUID insertUser(String nickname) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, ?, true, now(), now())""", id, nickname);
		return id;
	}

	private UUID insertRegion() {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("insert into regions (id, code, name) values (?, ?, ?)", id, "TEST-" + id, "지역");
		return id;
	}

	private void insertMember(UUID tripId, UUID userId, long joinOrder, String status) {
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at, left_at)
				values (?, ?, ?, ?, ?, now(), case when ? = 'ACTIVE' then null else now() end)""",
				UUID.randomUUID(), tripId, userId, status, joinOrder, status);
	}

}
