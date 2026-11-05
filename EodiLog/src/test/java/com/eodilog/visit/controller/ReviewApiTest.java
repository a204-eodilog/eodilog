package com.eodilog.visit.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 실제 커밋을 확인해야 하므로 테스트 트랜잭션을 쓰지 않는다. 테스트마다 새 여행·사용자로 자료를 구분한다
// 방장(참여 순 1)·동행(2)이 ACTIVE인 여행에서, 동행이 체크한 방문에 평가를 남기며 확인한다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ReviewApiTest {

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
	private UUID visitId;

	@BeforeEach
	void setUp() throws Exception {
		ownerId = insertUser("방장");
		friendId = insertUser("동행");
		tripId = createTrip(ownerId);
		ownerMemberId = jdbcTemplate.queryForObject("select id from trip_members where trip_id = ? and user_id = ?",
				UUID.class, tripId, ownerId);
		friendMemberId = insertActiveMember(tripId, friendId, 2);
		placeId = insertPlace("협재 해수욕장", "제주특별자치도 제주시 한림읍");
		visitId = createVisit(friendId, placeId);
	}

	@Test
	void writesReviewOnOwnVisitAndFillsVisitList() throws Exception {
		JsonNode review = data(writeReview(friendId, visitId, "{\"score\":4,\"body\":\"  바다가 보여요\\n좋았어요 \"}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.visitId").value(visitId.toString()))
				.andExpect(jsonPath("$.data.authorMemberId").value(friendMemberId.toString()))
				.andExpect(jsonPath("$.data.score").value(4))
				// 본문은 받은 그대로 저장한다
				.andExpect(jsonPath("$.data.body").value("  바다가 보여요\n좋았어요 "))
				.andExpect(jsonPath("$.data.version").value(1))
				.andExpect(jsonPath("$.data.visit.placeId").value(placeId.toString()))
				.andExpect(jsonPath("$.data.visit.visitedAt").value("2026-11-01T01:00:00Z"))
				.andExpect(jsonPath("$.data.place.name").value("협재 해수욕장"))
				.andExpect(jsonPath("$.data.place.address").value("제주특별자치도 제주시 한림읍")));
		UUID reviewId = UUID.fromString(review.get("id").asString());
		assertThat(reviewId.version()).isEqualTo(7);
		assertThat(review.get("createdAt").asString()).isEqualTo(review.get("updatedAt").asString());

		// 방문 목록에 평가가 채워지고 reviewStatus 필터가 동작한다
		UUID unreviewed = createVisit(friendId, insertPlace("우도", null));
		getVisits(friendId, "")
				.andExpect(jsonPath("$.data", hasSize(2)))
				.andExpect(jsonPath("$.data[1].id").value(visitId.toString()))
				.andExpect(jsonPath("$.data[1].reviewId").value(reviewId.toString()))
				.andExpect(jsonPath("$.data[1].reviewScore").value(4))
				.andExpect(jsonPath("$.data[0].reviewId").isEmpty());
		getVisits(friendId, "?reviewStatus=WRITTEN")
				.andExpect(jsonPath("$.data[*].id", contains(visitId.toString())));
		getVisits(friendId, "?reviewStatus=UNWRITTEN")
				.andExpect(jsonPath("$.data[*].id", contains(unreviewed.toString())));
		// 같은 장소를 다시 체크하면 돌려주는 기존 방문에도 평가가 담긴다
		postVisit(friendId, placeId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.reviewId").value(reviewId.toString()))
				.andExpect(jsonPath("$.data.reviewScore").value(4));
	}

	@Test
	void bumpsVersionOnlyWhenChangedAndChecksExpectedVersion() throws Exception {
		writeReview(friendId, visitId, "{\"score\":3,\"body\":\"보통\"}").andExpect(status().isOk());

		// 같은 내용은 version 그대로, 점수만 바꾸면 2
		writeReview(friendId, visitId, "{\"score\":3,\"body\":\"보통\",\"expectedVersion\":1}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(1));
		writeReview(friendId, visitId, "{\"score\":5,\"body\":\"보통\",\"expectedVersion\":1}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(2))
				.andExpect(jsonPath("$.data.score").value(5));
		// 예전 version은 409, 값은 그대로
		expectCode(writeReview(friendId, visitId, "{\"score\":1,\"body\":\"별로\",\"expectedVersion\":1}"), 409,
				"VERSION_CONFLICT");
		assertThat(count("select score from reviews where visit_id = ?", visitId)).isEqualTo(5);
		// expectedVersion을 생략하면 덮어쓴다
		writeReview(friendId, visitId, "{\"score\":2,\"body\":\"다시 생각하니 별로\"}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(3));
		assertThat(count("select count(*) from reviews where visit_id = ?", visitId)).isEqualTo(1);
	}

	@Test
	void rejectsInvalidInput() throws Exception {
		expectField(writeReview(friendId, visitId, "{\"body\":\"좋아요\"}"), "score");
		expectField(writeReview(friendId, visitId, "{\"score\":0,\"body\":\"좋아요\"}"), "score");
		expectField(writeReview(friendId, visitId, "{\"score\":6,\"body\":\"좋아요\"}"), "score");
		// 반 점·문자열 점수는 정수로 바꿔 받지 않는다
		expectField(writeReview(friendId, visitId, "{\"score\":2.5,\"body\":\"좋아요\"}"), "score");
		expectField(writeReview(friendId, visitId, "{\"score\":\"3\",\"body\":\"좋아요\"}"), "score");
		expectField(writeReview(friendId, visitId, "{\"score\":3}"), "body");
		expectField(writeReview(friendId, visitId, "{\"score\":3,\"body\":\"  \\n \"}"), "body");
		expectField(writeReview(friendId, visitId, "{\"score\":3,\"body\":\"a\\u0000b\"}"), "body");
		// 1,000자는 코드 포인트로 센다(이모지 하나가 1자)
		writeReview(friendId, visitId, "{\"score\":3,\"body\":\"%s\"}".formatted("😀".repeat(1000)))
				.andExpect(status().isOk());
		expectField(writeReview(friendId, visitId, "{\"score\":3,\"body\":\"%s\"}".formatted("가".repeat(1001))), "body");
		expectField(writeReview(friendId, visitId, "{\"score\":3,\"body\":\"좋아요\",\"expectedVersion\":0}"),
				"expectedVersion");
		expectField(writeReview(friendId, visitId, "{\"score\":3,\"body\":\"좋아요\",\"rating\":3}"), "rating");
		// 아직 평가가 없는데 expectedVersion을 보내면 400
		UUID fresh = createVisit(friendId, insertPlace("우도", null));
		expectField(writeReview(friendId, fresh, "{\"score\":3,\"body\":\"좋아요\",\"expectedVersion\":1}"),
				"expectedVersion");
		assertThat(count("select count(*) from reviews where visit_id = ?", fresh)).isZero();
	}

	@Test
	void allowsOnlyVisitOwnerAndHidesOtherTrips() throws Exception {
		// 동행의 방문에는 방장도 쓸 수 없다
		expectCode(writeReview(ownerId, visitId, "{\"score\":3,\"body\":\"좋아요\"}"), 403, "FORBIDDEN");
		// 해제한 방문·없는 방문·다른 여행의 방문은 404
		UUID released = createVisit(friendId, insertPlace("우도", null));
		mockMvc.perform(delete("/api/v1/trips/{tripId}/visits/{visitId}", tripId, released).with(authUser(friendId)))
				.andExpect(status().isNoContent());
		expectCode(writeReview(friendId, released, "{\"score\":3,\"body\":\"좋아요\"}"), 404, "VISIT_NOT_FOUND");
		expectCode(writeReview(friendId, UUID.randomUUID(), "{\"score\":3,\"body\":\"좋아요\"}"), 404, "VISIT_NOT_FOUND");
		UUID otherTripId = createTrip(friendId);
		expectCode(mockMvc.perform(put("/api/v1/trips/{tripId}/visits/{visitId}/review", otherTripId, visitId)
						.with(authUser(friendId)).contentType(MediaType.APPLICATION_JSON)
						.content("{\"score\":3,\"body\":\"좋아요\"}")), 404, "VISIT_NOT_FOUND");
		// 비멤버·나간 멤버는 여행 자체가 없다
		UUID stranger = insertUser("모르는 사람");
		expectCode(writeReview(stranger, visitId, "{\"score\":3,\"body\":\"좋아요\"}"), 404, "TRIP_NOT_FOUND");
		expectCode(getReviews(stranger, ""), 404, "TRIP_NOT_FOUND");
		writeReview(friendId, visitId, "{\"score\":3,\"body\":\"좋아요\"}").andExpect(status().isOk());
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where id = ?", friendMemberId);
		expectCode(writeReview(friendId, visitId, "{\"score\":4,\"body\":\"좋아요\"}"), 404, "TRIP_NOT_FOUND");
		expectCode(deleteReview(friendId, visitId), 404, "TRIP_NOT_FOUND");
		// 나간 멤버의 평가는 남아 다른 멤버가 본다
		getReviews(ownerId, "").andExpect(jsonPath("$.data[*].visitId", contains(visitId.toString())));
	}

	@Test
	void deletesOwnReviewAndBlocksVisitReleaseWhileReviewExists() throws Exception {
		writeReview(friendId, visitId, "{\"score\":5,\"body\":\"최고\"}").andExpect(status().isOk());

		// 평가가 있는 방문은 해제할 수 없다
		expectCode(mockMvc.perform(delete("/api/v1/trips/{tripId}/visits/{visitId}", tripId, visitId)
				.with(authUser(friendId))), 409, "REVIEW_EXISTS");
		// 다른 사람의 평가는 지울 수 없다
		expectCode(deleteReview(ownerId, visitId), 403, "FORBIDDEN");

		deleteReview(friendId, visitId).andExpect(status().isNoContent());
		assertThat(count("select count(*) from reviews where visit_id = ?", visitId)).isZero();
		expectCode(deleteReview(friendId, visitId), 404, "REVIEW_NOT_FOUND");
		// 다시 쓰면 새 평가(version 1)
		writeReview(friendId, visitId, "{\"score\":4,\"body\":\"다시\"}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(1));
		deleteReview(friendId, visitId).andExpect(status().isNoContent());
		// 평가를 지우면 방문을 해제할 수 있다
		mockMvc.perform(delete("/api/v1/trips/{tripId}/visits/{visitId}", tripId, visitId).with(authUser(friendId)))
				.andExpect(status().isNoContent());
		expectCode(deleteReview(friendId, visitId), 404, "VISIT_NOT_FOUND");
	}

	@Test
	void listsTripReviewsWithMemberFilterAndCursor() throws Exception {
		UUID ownerVisit = createVisit(ownerId, placeId);
		UUID secondFriendVisit = createVisit(friendId, insertPlace("우도", "제주시 우도면"));
		writeReview(friendId, visitId, "{\"score\":4,\"body\":\"첫 번째\"}").andExpect(status().isOk());
		writeReview(ownerId, ownerVisit, "{\"score\":3,\"body\":\"두 번째\"}").andExpect(status().isOk());
		writeReview(friendId, secondFriendVisit, "{\"score\":5,\"body\":\"세 번째\"}").andExpect(status().isOk());

		// 기본은 여행 전체, 최근 작성 순
		getReviews(ownerId, "")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[*].body", contains("세 번째", "두 번째", "첫 번째")))
				.andExpect(jsonPath("$.data[0].place.name").value("우도"))
				.andExpect(jsonPath("$.data[1].authorMemberId").value(ownerMemberId.toString()))
				.andExpect(jsonPath("$.page.hasNext").value(false));
		getReviews(ownerId, "?memberId=" + friendMemberId)
				.andExpect(jsonPath("$.data[*].body", contains("세 번째", "첫 번째")));

		JsonNode firstPage = body(getReviews(ownerId, "?limit=2")
				.andExpect(jsonPath("$.data", hasSize(2)))
				.andExpect(jsonPath("$.page.hasNext").value(true)));
		getReviews(ownerId, "?limit=2&cursor=" + firstPage.get("page").get("nextCursor").asString())
				.andExpect(jsonPath("$.data[*].body", contains("첫 번째")))
				.andExpect(jsonPath("$.page.hasNext").value(false));

		// 다른 여행·없는 멤버십은 400
		UUID otherTripId = createTrip(ownerId);
		UUID otherMemberId = jdbcTemplate.queryForObject("select id from trip_members where trip_id = ?", UUID.class,
				otherTripId);
		expectField(getReviews(ownerId, "?memberId=" + otherMemberId), "memberId");
		expectField(getReviews(ownerId, "?memberId=" + UUID.randomUUID()), "memberId");
		// 다른 여행의 평가는 섞이지 않는다
		getReviews(ownerId, "").andExpect(jsonPath("$.data", hasSize(3)));
		mockMvc.perform(get("/api/v1/trips/{tripId}/reviews", otherTripId).with(authUser(ownerId)))
				.andExpect(jsonPath("$.data", hasSize(0)));
	}

	@Test
	void concurrentFirstWritesMakeOneReview() throws Exception {
		int writers = 4;
		CountDownLatch ready = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(writers);
		List<Future<Integer>> futures = new ArrayList<>();
		try {
			for (int i = 0; i < writers; i++) {
				int score = i + 1;
				Callable<Integer> call = () -> {
					ready.await();
					return writeReview(friendId, visitId, "{\"score\":%d,\"body\":\"동시\"}".formatted(score))
							.andReturn().getResponse().getStatus();
				};
				futures.add(executor.submit(call));
			}
			ready.countDown();
			for (Future<Integer> future : futures) {
				assertThat(future.get()).isEqualTo(200);
			}
		} finally {
			executor.shutdownNow();
		}
		assertThat(count("select count(*) from reviews where visit_id = ?", visitId)).isEqualTo(1);
	}

	@Test
	void documentsReviewApis() throws Exception {
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/visits/{visitId}/review'].put.tags[0]").value("평가"))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/visits/{visitId}/review'].put.responses['409'].description")
						.value(containsString("VERSION_CONFLICT")))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/visits/{visitId}/review'].delete.responses['404'].description")
						.value(containsString("REVIEW_NOT_FOUND")))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/reviews'].get.responses['200']").exists())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/visits/{visitId}'].delete.responses['409'].description")
						.value(containsString("REVIEW_EXISTS")))
				.andExpect(jsonPath("$.components.schemas.ReviewWriteRequest.properties.score.description").exists())
				.andExpect(jsonPath("$.components.schemas.ReviewResponse.properties.place").exists());
	}

	private ResultActions writeReview(UUID userId, UUID reviewVisitId, String body) throws Exception {
		return mockMvc.perform(put("/api/v1/trips/{tripId}/visits/{visitId}/review", tripId, reviewVisitId)
				.with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content(body));
	}

	private ResultActions deleteReview(UUID userId, UUID reviewVisitId) throws Exception {
		return mockMvc.perform(delete("/api/v1/trips/{tripId}/visits/{visitId}/review", tripId, reviewVisitId)
				.with(authUser(userId)));
	}

	private ResultActions getReviews(UUID userId, String query) throws Exception {
		return mockMvc.perform(get("/api/v1/trips/" + tripId + "/reviews" + query).with(authUser(userId)));
	}

	private ResultActions getVisits(UUID userId, String query) throws Exception {
		return mockMvc.perform(get("/api/v1/trips/" + tripId + "/visits" + query).with(authUser(userId)));
	}

	private ResultActions postVisit(UUID userId, UUID visitPlaceId) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/visits", tripId).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"placeId\":\"%s\",\"visitedAt\":\"2026-11-01T01:00:00Z\",\"evidenceType\":\"MANUAL\"}"
						.formatted(visitPlaceId)));
	}

	private UUID createVisit(UUID userId, UUID visitPlaceId) throws Exception {
		return UUID.fromString(data(postVisit(userId, visitPlaceId).andExpect(status().isCreated())).get("id").asString());
	}

	private void expectField(ResultActions result, String field) throws Exception {
		result.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields[0].field").value(field));
	}

	private void expectCode(ResultActions result, int status, String code) throws Exception {
		result.andExpect(status().is(status))
				.andExpect(jsonPath("$.error.code").value(code));
	}

	private JsonNode data(ResultActions result) throws Exception {
		return body(result).get("data");
	}

	private JsonNode body(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString());
	}

	private UUID createTrip(UUID userId) throws Exception {
		return UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(userId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"title\":\"제주\"}"))
				.andExpect(status().isCreated())).get("id").asString());
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

	private UUID insertPlace(String name, String address) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into places (id, name, address, latitude, longitude, source, created_at, updated_at)
				values (?, ?, ?, 33.3940000, 126.2390000, 'MANUAL', now(), now())""", id, name, address);
		return id;
	}

}
