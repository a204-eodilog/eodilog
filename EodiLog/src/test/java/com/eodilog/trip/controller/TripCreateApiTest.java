package com.eodilog.trip.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
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

// 실제 트랜잭션 커밋과 동시 요청을 확인해야 하므로 테스트 트랜잭션을 쓰지 않는다. 테스트마다 새 사용자로 자료를 구분한다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class TripCreateApiTest {

	private static final String UTC_DATETIME = "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	private UUID userId;

	@BeforeEach
	void setUp() {
		userId = insertUser("여행자");
	}

	@Test
	void createsTripWithTitleOnly() throws Exception {
		JsonNode trip = data(createTrip(userId, "key-1", "{\"title\":\"  제주 3박 4일  \"}")
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.title").value("제주 3박 4일"))
				.andExpect(jsonPath("$.data.startDate").isEmpty())
				.andExpect(jsonPath("$.data.endDate").isEmpty())
				.andExpect(jsonPath("$.data.destinationRegionIds", hasSize(0)))
				.andExpect(jsonPath("$.data.status").value("PLANNING"))
				.andExpect(jsonPath("$.data.currency").value("KRW"))
				.andExpect(jsonPath("$.data.version").value(1))
				.andExpect(jsonPath("$.data.expenseVersion").value(0))
				.andExpect(jsonPath("$.data.members", hasSize(1)))
				.andExpect(jsonPath("$.data.members[0].role").value("OWNER"))
				.andExpect(jsonPath("$.data.members[0].status").value("ACTIVE"))
				.andExpect(jsonPath("$.data.members[0].joinOrder").value(1))
				.andExpect(jsonPath("$.data.members[0].joinedAt").value(matchesPattern(UTC_DATETIME)))
				.andExpect(jsonPath("$.data.members[0].leftAt").isEmpty())
				.andExpect(jsonPath("$.data.members[0].user.id").value(userId.toString()))
				.andExpect(jsonPath("$.data.members[0].user.nickname").value("여행자"))
				.andExpect(jsonPath("$.data.members[0].user.email").doesNotExist())
				.andExpect(jsonPath("$.data.members[0].user.ageBand").doesNotExist()));

		UUID tripId = UUID.fromString(trip.get("id").asString());
		assertThat(trip.get("ownerMemberId").asString()).isEqualTo(trip.get("members").get(0).get("id").asString());
		assertThat(count("select count(*) from trip_members where trip_id = ? and user_id = ? and status = 'ACTIVE'",
				tripId, userId)).isEqualTo(1);
		assertThat(count("""
				select count(*) from chat_participants p join chat_rooms r on r.id = p.room_id
				where r.trip_id = ? and p.user_id = ?""", tripId, userId)).isEqualTo(1);
		assertThat(jdbcTemplate.queryForObject("select version from itineraries where trip_id = ?", Long.class, tripId))
				.isEqualTo(1);
	}

	@Test
	void createsTripWithPeriodAndDestinationsInInputOrder() throws Exception {
		UUID busan = insertRegion();
		UUID jeju = insertRegion();
		LocalDate start = LocalDate.now().plusYears(1);

		createTrip(userId, "key-1", """
				{"title":"남쪽 여행","startDate":"%s","endDate":"%s","destinationRegionIds":["%s","%s"]}
				""".formatted(start, start.plusDays(2), jeju, busan))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.startDate").value(start.toString()))
				.andExpect(jsonPath("$.data.endDate").value(start.plusDays(2).toString()))
				.andExpect(jsonPath("$.data.destinationRegionIds[0]").value(jeju.toString()))
				.andExpect(jsonPath("$.data.destinationRegionIds[1]").value(busan.toString()))
				.andExpect(jsonPath("$.data.status").value("PLANNING"));
	}

	@Test
	void marksPastTripCompleted() throws Exception {
		LocalDate start = LocalDate.now().minusYears(1);

		createTrip(userId, "key-1", """
				{"title":"지난 여행","startDate":"%s","endDate":"%s"}""".formatted(start, start.plusDays(1)))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.status").value("COMPLETED"));
	}

	@Test
	void rejectsInvalidInputWithAllFields() throws Exception {
		createTrip(userId, "key-1", """
				{"title":"   ","startDate":"2026-11-03","endDate":"2026-11-01","destinationRegionIds":["%s"]}
				""".formatted(UUID.randomUUID()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields[*].field")
						.value(org.hamcrest.Matchers.containsInAnyOrder("title", "endDate", "destinationRegionIds")));
		assertThat(tripCount(userId)).isZero();
	}

	@Test
	void rejectsTooLongTitle() throws Exception {
		createTrip(userId, "key-1", "{\"title\":\"%s\"}".formatted("가".repeat(201)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("title"));
	}

	@Test
	void rejectsOneSidedPeriod() throws Exception {
		createTrip(userId, "key-1", "{\"title\":\"제주\",\"startDate\":\"2026-11-01\"}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("endDate"));
	}

	@Test
	void rejectsDuplicateDestinations() throws Exception {
		UUID jeju = insertRegion();

		createTrip(userId, "key-1", """
				{"title":"제주","destinationRegionIds":["%s","%s"]}""".formatted(jeju, jeju))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("destinationRegionIds"));
	}

	@Test
	void rejectsClientControlledFields() throws Exception {
		createTrip(userId, "key-1", "{\"title\":\"제주\",\"status\":\"ONGOING\"}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("status"));
		createTrip(userId, "key-2", "{\"title\":\"제주\",\"currency\":\"USD\"}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("currency"));
	}

	@Test
	void requiresIdempotencyKey() throws Exception {
		createTrip(userId, null, "{\"title\":\"제주\"}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value(IdempotencyService.HEADER_NAME));
		createTrip(userId, "k".repeat(101), "{\"title\":\"제주\"}")
				.andExpect(status().isBadRequest());
		assertThat(tripCount(userId)).isZero();
	}

	@Test
	void replaysFirstResultForSameKeyAndBody() throws Exception {
		JsonNode first = data(createTrip(userId, "key-1", "{\"title\":\"제주\"}").andExpect(status().isCreated()));
		JsonNode second = data(createTrip(userId, "key-1", "{ \"title\" : \"제주\" }").andExpect(status().isCreated()));

		assertThat(second).isEqualTo(first);
		assertThat(tripCount(userId)).isEqualTo(1);
	}

	@Test
	void rejectsSameKeyWithDifferentBody() throws Exception {
		createTrip(userId, "key-1", "{\"title\":\"제주\"}").andExpect(status().isCreated());

		createTrip(userId, "key-1", "{\"title\":\"부산\"}")
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("IDEMPOTENCY_KEY_REUSED"));
		assertThat(tripCount(userId)).isEqualTo(1);
	}

	@Test
	void scopesKeyPerUser() throws Exception {
		UUID otherUserId = insertUser("다른 여행자");

		createTrip(userId, "shared-key", "{\"title\":\"제주\"}").andExpect(status().isCreated());
		createTrip(otherUserId, "shared-key", "{\"title\":\"제주\"}").andExpect(status().isCreated());

		assertThat(tripCount(userId)).isEqualTo(1);
		assertThat(tripCount(otherUserId)).isEqualTo(1);
	}

	@Test
	void createsOnlyOneTripForConcurrentRetries() throws Exception {
		int requests = 4;
		CountDownLatch ready = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(requests);
		List<Future<MockHttpServletResponse>> futures = new ArrayList<>();
		try {
			for (int i = 0; i < requests; i++) {
				Callable<MockHttpServletResponse> call = () -> {
					ready.await();
					return createTrip(userId, "same-key", "{\"title\":\"제주\"}").andReturn().getResponse();
				};
				futures.add(executor.submit(call));
			}
			ready.countDown();

			List<String> tripIds = new ArrayList<>();
			for (Future<MockHttpServletResponse> future : futures) {
				MockHttpServletResponse response = future.get();
				assertThat(response.getStatus()).isIn(201, 409);
				if (response.getStatus() == 201) {
					tripIds.add(jsonMapper.readTree(response.getContentAsString()).get("data").get("id").asString());
				}
			}
			assertThat(tripIds).isNotEmpty().allMatch(id -> id.equals(tripIds.getFirst()));
		} finally {
			executor.shutdownNow();
		}
		assertThat(tripCount(userId)).isEqualTo(1);
	}

	@Test
	void documentsCreateTripApi() throws Exception {
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/trips'].post.tags[0]").value("여행"))
				.andExpect(jsonPath("$.paths['/api/v1/trips'].post.responses['201']").exists())
				.andExpect(jsonPath("$.paths['/api/v1/trips'].post.responses['409'].content['application/json'].schema['$ref']")
						.value("#/components/schemas/ErrorResponse"))
				.andExpect(jsonPath("$.paths['/api/v1/trips'].post.parameters[?(@.name == 'Idempotency-Key')].required")
						.value(org.hamcrest.Matchers.contains(true)))
				.andExpect(jsonPath("$.components.schemas.CreateTripRequest.properties.status").doesNotExist());
	}

	private ResultActions createTrip(UUID requesterId, String idempotencyKey, String body) throws Exception {
		var request = post("/api/v1/trips").with(authUser(requesterId)).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(body);
		if (idempotencyKey != null) {
			request.header(IdempotencyService.HEADER_NAME, idempotencyKey);
		}
		return mockMvc.perform(request);
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

	private long tripCount(UUID ownerId) {
		return count("select count(*) from trips where owner_user_id = ?", ownerId);
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

	private UUID insertRegion() {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("insert into regions (id, code, name) values (?, ?, ?)", id, "TEST-" + id, "지역");
		return id;
	}

}
