package com.eodilog.trip.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.trip.domain.TripStatusPolicy;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
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

// 테스트마다 새 사용자를 만들어 자료를 구분한다. 여행은 실제 생성 API로 만들고, 멤버·시각 조작만 SQL로 한다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class TripQueryApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	private UUID ownerId;

	@BeforeEach
	void setUp() {
		ownerId = insertUser("방장");
	}

	@Test
	void detailMatchesCreateResponse() throws Exception {
		JsonNode created = createTrip(ownerId, "{\"title\":\"제주 3박 4일\"}");

		JsonNode found = data(getTrip(ownerId, id(created)).andExpect(status().isOk()));

		assertThat(found).isEqualTo(created);
	}

	@Test
	void detailShowsActiveMembersInJoinOrderWithRoles() throws Exception {
		UUID tripId = id(createTrip(ownerId, "{\"title\":\"제주\"}"));
		UUID friendId = insertUser("동행");
		UUID leaverId = insertUser("나간 동행");
		insertMember(tripId, friendId, 2, "ACTIVE");
		insertMember(tripId, leaverId, 3, "LEFT");

		JsonNode trip = data(getTrip(friendId, tripId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.members", hasSize(2)))
				.andExpect(jsonPath("$.data.members[0].role").value("OWNER"))
				.andExpect(jsonPath("$.data.members[0].user.id").value(ownerId.toString()))
				.andExpect(jsonPath("$.data.members[1].role").value("MEMBER"))
				.andExpect(jsonPath("$.data.members[1].user.nickname").value("동행"))
				.andExpect(jsonPath("$.data.members[1].joinOrder").value(2))
				.andExpect(jsonPath("$.data.members[*].user.email").isEmpty()));

		assertThat(trip.get("ownerMemberId")).isEqualTo(trip.get("members").get(0).get("id"));
	}

	@Test
	void hidesTripFromNonMembersLeaversAndAfterDeletion() throws Exception {
		UUID tripId = id(createTrip(ownerId, "{\"title\":\"제주\"}"));
		UUID strangerId = insertUser("모르는 사람");
		UUID leaverId = insertUser("나간 동행");
		insertMember(tripId, leaverId, 2, "LEFT");

		expectTripNotFound(getTrip(strangerId, tripId));
		expectTripNotFound(getTrip(leaverId, tripId));
		expectTripNotFound(getTrip(ownerId, UUID.randomUUID()));

		jdbcTemplate.update("update trips set deleted_at = now() where id = ?", tripId);
		expectTripNotFound(getTrip(ownerId, tripId));
	}

	@Test
	void rejectsMalformedTripId() throws Exception {
		mockMvc.perform(get("/api/v1/trips/not-a-uuid").with(authUser(ownerId)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("tripId"));
	}

	@Test
	void computesStatusFromTodayInsteadOfStoredValue() throws Exception {
		LocalDate future = today().plusYears(1);
		UUID tripId = id(createTrip(ownerId, period("제주", future, future.plusDays(1))));
		jdbcTemplate.update("update trips set start_date = ?, end_date = ? where id = ?",
				today().minusDays(10), today().minusDays(8), tripId);

		getTrip(ownerId, tripId).andExpect(jsonPath("$.data.status").value("COMPLETED"));
		assertThat(jdbcTemplate.queryForObject("select status from trips where id = ?", String.class, tripId))
				.isEqualTo("PLANNING");
	}

	@Test
	void listsOnlyTripsWithActiveMembership() throws Exception {
		UUID otherId = insertUser("다른 방장");
		UUID mine = id(createTrip(ownerId, "{\"title\":\"내 여행\"}"));
		UUID joined = id(createTrip(otherId, "{\"title\":\"참여한 여행\"}"));
		UUID left = id(createTrip(otherId, "{\"title\":\"나간 여행\"}"));
		UUID unrelated = id(createTrip(otherId, "{\"title\":\"남의 여행\"}"));
		insertMember(joined, ownerId, 2, "ACTIVE");
		insertMember(left, ownerId, 2, "LEFT");

		List<UUID> ids = ids(listTrips(ownerId, "").andExpect(status().isOk()));

		assertThat(ids).containsExactly(joined, mine).doesNotContain(left, unrelated);
	}

	@Test
	void pagesByCursorNewestFirst() throws Exception {
		UUID first = id(createTrip(ownerId, "{\"title\":\"첫 여행\"}"));
		UUID second = id(createTrip(ownerId, "{\"title\":\"둘째 여행\"}"));
		UUID third = id(createTrip(ownerId, "{\"title\":\"셋째 여행\"}"));

		JsonNode page1 = body(listTrips(ownerId, "limit=2")
				.andExpect(jsonPath("$.page.hasNext").value(true)));
		String cursor = page1.get("page").get("nextCursor").asString();
		JsonNode page2 = body(listTrips(ownerId, "limit=2&cursor=" + cursor)
				.andExpect(jsonPath("$.page.hasNext").value(false))
				.andExpect(jsonPath("$.page.nextCursor").isEmpty()));

		List<UUID> ids = new ArrayList<>(ids(page1));
		ids.addAll(ids(page2));
		assertThat(ids).containsExactly(third, second, first);
	}

	@Test
	void breaksCreatedAtTiesByIdDescending() throws Exception {
		UUID a = id(createTrip(ownerId, "{\"title\":\"A\"}"));
		UUID b = id(createTrip(ownerId, "{\"title\":\"B\"}"));
		jdbcTemplate.update("update trips set created_at = '2026-10-28T00:00:00Z' where id in (?, ?)", a, b);
		List<UUID> expected = jdbcTemplate.queryForList(
				"select id from trips where id in (?, ?) order by id desc", UUID.class, a, b);

		JsonNode page1 = body(listTrips(ownerId, "limit=1"));
		JsonNode page2 = body(listTrips(ownerId, "limit=1&cursor=" + page1.get("page").get("nextCursor").asString()));

		assertThat(List.of(ids(page1).getFirst(), ids(page2).getFirst())).isEqualTo(expected);
	}

	@Test
	void filtersByStatusUsingToday() throws Exception {
		LocalDate today = today();
		UUID undated = id(createTrip(ownerId, "{\"title\":\"미정\"}"));
		UUID upcoming = id(createTrip(ownerId, period("예정", today.plusDays(3), today.plusDays(5))));
		UUID ongoing = id(createTrip(ownerId, period("진행", today.minusDays(1), today.plusDays(1))));
		UUID finished = id(createTrip(ownerId, period("끝", today.minusDays(5), today.minusDays(3))));

		assertThat(ids(listTrips(ownerId, "status=PLANNING"))).containsExactlyInAnyOrder(undated, upcoming);
		assertThat(ids(listTrips(ownerId, "status=ONGOING"))).containsExactly(ongoing);
		assertThat(ids(listTrips(ownerId, "status=COMPLETED"))).containsExactly(finished);
		listTrips(ownerId, "status=ONGOING").andExpect(jsonPath("$.data[0].status").value("ONGOING"));
	}

	@Test
	void returnsEmptyPageWithoutTrips() throws Exception {
		listTrips(ownerId, "")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data", hasSize(0)))
				.andExpect(jsonPath("$.page.hasNext").value(false))
				.andExpect(jsonPath("$.page.nextCursor").isEmpty());
	}

	@Test
	void rejectsInvalidListParameters() throws Exception {
		listTrips(ownerId, "limit=0").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("limit"));
		listTrips(ownerId, "limit=101").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("limit"));
		listTrips(ownerId, "status=SOMEDAY").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("status"));
		listTrips(ownerId, "cursor=not-a-cursor").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("cursor"));
	}

	@Test
	void documentsQueryApis() throws Exception {
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/me/trips'].get.tags[0]").value("여행"))
				.andExpect(jsonPath("$.paths['/api/v1/me/trips'].get.parameters[*].name").value(hasItems("status", "cursor", "limit")))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}'].get.responses['404'].description")
						.value(containsString("TRIP_NOT_FOUND")));
	}

	private void expectTripNotFound(ResultActions result) throws Exception {
		result.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
	}

	private JsonNode createTrip(UUID userId, String body) throws Exception {
		return data(mockMvc.perform(post("/api/v1/trips").with(authUser(userId)).with(csrf())
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isCreated()));
	}

	private ResultActions getTrip(UUID userId, UUID tripId) throws Exception {
		return mockMvc.perform(get("/api/v1/trips/{tripId}", tripId).with(authUser(userId)));
	}

	private ResultActions listTrips(UUID userId, String query) throws Exception {
		return mockMvc.perform(get("/api/v1/me/trips?" + query).with(authUser(userId)));
	}

	private JsonNode body(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString());
	}

	private JsonNode data(ResultActions result) throws Exception {
		return body(result).get("data");
	}

	private List<UUID> ids(ResultActions result) throws Exception {
		return ids(body(result));
	}

	private List<UUID> ids(JsonNode page) {
		List<UUID> ids = new ArrayList<>();
		page.get("data").forEach(trip -> ids.add(id(trip)));
		return ids;
	}

	private UUID id(JsonNode trip) {
		return UUID.fromString(trip.get("id").asString());
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

	private void insertMember(UUID tripId, UUID userId, long joinOrder, String status) {
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at, left_at)
				values (?, ?, ?, ?, ?, now(), case when ? = 'ACTIVE' then null else now() end)""",
				UUID.randomUUID(), tripId, userId, status, joinOrder, status);
	}

}
