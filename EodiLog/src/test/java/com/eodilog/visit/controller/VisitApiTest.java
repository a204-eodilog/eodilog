package com.eodilog.visit.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 동시 체크를 실제 커밋으로 확인해야 하므로 테스트 트랜잭션을 쓰지 않는다. 테스트마다 새 사용자·여행·장소로 자료를 구분한다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class VisitApiTest {

	private static final String VISITED_AT = "2026-11-01T01:00:00Z";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	private UUID ownerId;
	private UUID friendId;
	private UUID tripId;
	private UUID ownerMemberId;
	private UUID friendMemberId;
	private UUID placeId;

	@BeforeEach
	void setUp() throws Exception {
		ownerId = insertUser("방장");
		friendId = insertUser("동행");
		tripId = createTrip(ownerId);
		ownerMemberId = memberId(tripId, ownerId);
		friendMemberId = insertActiveMember(tripId, friendId, 2);
		placeId = insertPlace();
	}

	@Test
	void checksVisitAndReturnsExistingVisitOnRepeat() throws Exception {
		// 코스에 없는 장소도 체크할 수 있다
		JsonNode visit = data(createVisit(friendId, placeId, VISITED_AT)
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.tripId").value(tripId.toString()))
				.andExpect(jsonPath("$.data.memberId").value(friendMemberId.toString()))
				.andExpect(jsonPath("$.data.placeId").value(placeId.toString()))
				.andExpect(jsonPath("$.data.visitedAt").value(VISITED_AT))
				.andExpect(jsonPath("$.data.evidenceType").value("MANUAL"))
				.andExpect(jsonPath("$.data.reviewId").isEmpty())
				.andExpect(jsonPath("$.data.reviewScore").isEmpty()));
		UUID visitId = UUID.fromString(visit.get("id").asString());
		assertThat(visitId.version()).isEqualTo(7);

		// 같은 장소를 다시 체크하면 새로 만들지 않고 기존 방문을 그대로(visitedAt 포함) 200으로 돌려준다
		createVisit(friendId, placeId, "2026-11-02T03:00:00Z")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.id").value(visitId.toString()))
				.andExpect(jsonPath("$.data.visitedAt").value(VISITED_AT));
		// 다른 멤버가 같은 장소를 체크하면 그 사람의 방문이 따로 생긴다
		createVisit(ownerId, placeId, VISITED_AT).andExpect(status().isCreated());
		assertThat(count("select count(*) from visits where trip_id = ? and deleted_at is null", tripId)).isEqualTo(2);
		// 여행 version과는 무관하다
		assertThat(count("select version from trips where id = ?", tripId)).isEqualTo(1);
	}

	@Test
	void rejectsInvalidInputBeforeMembershipAndUnknownPlaceAfter() throws Exception {
		postVisit(friendId, "{}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields[*].field").value(
						containsInAnyOrder("placeId", "visitedAt", "evidenceType")));
		// 사진 방문은 방문 후보 확인으로만 생긴다
		postVisit(friendId, body(placeId, VISITED_AT, "PHOTO"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("evidenceType"));
		postVisit(friendId, body(placeId, VISITED_AT, "GPS")).andExpect(status().isBadRequest());
		// 5분을 넘는 미래 시각은 거부, 그 안은 받는다
		createVisit(friendId, placeId, Instant.now().plus(1, ChronoUnit.HOURS).toString())
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("visitedAt"));
		postVisit(friendId, "{\"placeId\":\"%s\",\"visitedAt\":\"%s\",\"evidenceType\":\"MANUAL\",\"memberId\":\"%s\"}"
				.formatted(placeId, VISITED_AT, ownerMemberId))
				.andExpect(status().isBadRequest());
		// 입력 오류가 권한보다 먼저다
		postVisit(insertUser("남"), "{}").andExpect(status().isBadRequest());
		// 입력이 맞으면 멤버 확인 404가 장소 확인보다 먼저다
		expectTripNotFound(createVisit(insertUser("또 남"), UUID.randomUUID(), VISITED_AT));
		createVisit(friendId, UUID.randomUUID(), VISITED_AT)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("placeId"));
		createVisit(friendId, placeId, Instant.now().plus(1, ChronoUnit.MINUTES).toString())
				.andExpect(status().isCreated());
		assertThat(count("select count(*) from visits where trip_id = ?", tripId)).isEqualTo(1);
	}

	@Test
	void listsOwnVisitsByDefaultAndMemberVisitsByFilter() throws Exception {
		UUID otherPlace = insertPlace();
		UUID first = visitId(createVisit(friendId, placeId, VISITED_AT));
		UUID second = visitId(createVisit(friendId, otherPlace, VISITED_AT));
		UUID ownerVisit = visitId(createVisit(ownerId, placeId, VISITED_AT));

		// 기본은 내 방문, 최근 등록 순
		getVisits(friendId, "")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[*].id").value(org.hamcrest.Matchers.contains(second.toString(), first.toString())))
				.andExpect(jsonPath("$.page.hasNext").value(false))
				.andExpect(jsonPath("$.page.nextCursor").isEmpty());
		getVisits(friendId, "?memberId=" + ownerMemberId)
				.andExpect(jsonPath("$.data", hasSize(1)))
				.andExpect(jsonPath("$.data[0].id").value(ownerVisit.toString()));
		getVisits(friendId, "?placeId=" + otherPlace)
				.andExpect(jsonPath("$.data", hasSize(1)))
				.andExpect(jsonPath("$.data[0].id").value(second.toString()));
		// 평가 기능 전: WRITTEN은 빈 목록, UNWRITTEN은 전체
		getVisits(friendId, "?reviewStatus=WRITTEN").andExpect(jsonPath("$.data", hasSize(0)));
		getVisits(friendId, "?reviewStatus=UNWRITTEN").andExpect(jsonPath("$.data", hasSize(2)));
		getVisits(friendId, "?reviewStatus=MAYBE").andExpect(status().isBadRequest());

		// 페이지
		JsonNode page = jsonMapper.readTree(getVisits(friendId, "?limit=1")
				.andExpect(jsonPath("$.data[0].id").value(second.toString()))
				.andExpect(jsonPath("$.page.hasNext").value(true))
				.andReturn().getResponse().getContentAsString());
		getVisits(friendId, "?limit=1&cursor=" + page.get("page").get("nextCursor").asString())
				.andExpect(jsonPath("$.data[0].id").value(first.toString()))
				.andExpect(jsonPath("$.page.hasNext").value(false));
		getVisits(friendId, "?limit=0").andExpect(status().isBadRequest());

		// 다른 여행의 멤버십·없는 멤버십으로는 볼 수 없다
		UUID otherTrip = createTrip(insertUser("다른 방장"));
		UUID outsider = memberId(otherTrip, jdbcTemplate.queryForObject(
				"select owner_user_id from trips where id = ?", UUID.class, otherTrip));
		getVisits(friendId, "?memberId=" + outsider)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("memberId"));
		getVisits(friendId, "?memberId=" + UUID.randomUUID()).andExpect(status().isBadRequest());
		expectTripNotFound(getVisits(insertUser("남"), ""));
	}

	@Test
	void keepsVisitsOfLeftMemberVisibleToOthers() throws Exception {
		UUID visitId = visitId(createVisit(friendId, placeId, VISITED_AT));
		mockMvc.perform(post("/api/v1/trips/{tripId}/leave", tripId).with(authUser(friendId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"deleteOwnPhotos\":false,\"deleteOwnMessages\":false,\"expectedVersion\":1}"))
				.andExpect(status().isOk());

		getVisits(ownerId, "?memberId=" + friendMemberId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[0].id").value(visitId.toString()));
		expectTripNotFound(getVisits(friendId, ""));
		expectTripNotFound(deleteVisit(friendId, visitId));
	}

	@Test
	void onlyVisitorUnchecksAndRecheckCreatesNewVisit() throws Exception {
		UUID visitId = visitId(createVisit(friendId, placeId, VISITED_AT));

		// 방장이라도 남의 방문은 지울 수 없다
		deleteVisit(ownerId, visitId)
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
		expectTripNotFound(deleteVisit(insertUser("남"), visitId));
		deleteVisit(friendId, UUID.randomUUID())
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("VISIT_NOT_FOUND"));
		// 다른 여행 경로로는 지울 수 없다
		UUID otherTrip = createTrip(friendId);
		mockMvc.perform(delete("/api/v1/trips/{tripId}/visits/{visitId}", otherTrip, visitId).with(authUser(friendId)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("VISIT_NOT_FOUND"));

		deleteVisit(friendId, visitId).andExpect(status().isNoContent());
		deleteVisit(friendId, visitId)
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("VISIT_NOT_FOUND"));
		getVisits(friendId, "").andExpect(jsonPath("$.data", hasSize(0)));
		assertThat(count("select count(*) from visits where id = ? and deleted_at is not null", visitId)).isEqualTo(1);

		// 다시 체크하면 새 방문이다
		UUID again = visitId(createVisit(friendId, placeId, VISITED_AT).andExpect(status().isCreated()));
		assertThat(again).isNotEqualTo(visitId);
	}

	@Test
	void concurrentChecksOfSamePlaceMakeOneVisit() throws Exception {
		int requests = 4;
		CountDownLatch ready = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(requests);
		List<Future<Integer>> futures = new ArrayList<>();
		try {
			for (int i = 0; i < requests; i++) {
				futures.add(executor.submit(() -> {
					ready.await();
					return createVisit(friendId, placeId, VISITED_AT).andReturn().getResponse().getStatus();
				}));
			}
			ready.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> future : futures) {
				statuses.add(future.get());
			}
			assertThat(statuses).containsOnlyOnce(201).containsOnly(201, 200);
		} finally {
			executor.shutdownNow();
		}
		assertThat(count("select count(*) from visits where trip_id = ?", tripId)).isEqualTo(1);
	}

	@Test
	void documentsVisitApi() throws Exception {
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/visits'].post.tags[0]").value("방문"))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/visits'].post.responses['201']").exists())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/visits'].post.responses['200']").exists())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/visits'].get.summary").value("방문 목록"))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/visits/{visitId}'].delete.responses['404'].description")
						.value(containsString("VISIT_NOT_FOUND")));
	}

	private ResultActions createVisit(UUID userId, UUID visitPlaceId, String visitedAt) throws Exception {
		return postVisit(userId, body(visitPlaceId, visitedAt, "MANUAL"));
	}

	private String body(UUID visitPlaceId, String visitedAt, String evidenceType) {
		return "{\"placeId\":\"%s\",\"visitedAt\":\"%s\",\"evidenceType\":\"%s\"}"
				.formatted(visitPlaceId, visitedAt, evidenceType);
	}

	private ResultActions postVisit(UUID userId, String body) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/visits", tripId).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content(body));
	}

	private ResultActions getVisits(UUID userId, String query) throws Exception {
		return mockMvc.perform(get("/api/v1/trips/" + tripId + "/visits" + query).with(authUser(userId)));
	}

	private ResultActions deleteVisit(UUID userId, UUID visitId) throws Exception {
		return mockMvc.perform(delete("/api/v1/trips/{tripId}/visits/{visitId}", tripId, visitId).with(authUser(userId)));
	}

	private void expectTripNotFound(ResultActions result) throws Exception {
		result.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
	}

	private UUID visitId(ResultActions result) throws Exception {
		return UUID.fromString(data(result).get("id").asString());
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

	private UUID createTrip(UUID userId) throws Exception {
		return UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(userId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"title\":\"제주\"}"))
				.andExpect(status().isCreated())).get("id").asString());
	}

	private UUID memberId(UUID memberTripId, UUID userId) {
		return jdbcTemplate.queryForObject("select id from trip_members where trip_id = ? and user_id = ?",
				UUID.class, memberTripId, userId);
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

	// 실제 참여(초대 수락)처럼 멤버십과 채팅 참여를 함께 넣는다
	private UUID insertActiveMember(UUID memberTripId, UUID userId, long joinOrder) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at)
				values (?, ?, ?, 'ACTIVE', ?, now())""", id, memberTripId, userId, joinOrder);
		jdbcTemplate.update("""
				insert into chat_participants (room_id, user_id, joined_at)
				select id, ?, now() from chat_rooms where trip_id = ?""", userId, memberTripId);
		return id;
	}

	private UUID insertPlace() {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into places (id, name, latitude, longitude, source, created_at, updated_at)
				values (?, '성산일출봉', 33.4589000, 126.9425000, 'MANUAL', now(), now())""", id);
		return id;
	}

}
