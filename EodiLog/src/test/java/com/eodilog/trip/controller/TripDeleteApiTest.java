package com.eodilog.trip.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
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
import com.eodilog.job.JobWorker;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.LockSupport;
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

// 여행 삭제(정책 §14). 실제 커밋과 TRIP_DELETE 작업의 물리 삭제를 확인해야 하므로 테스트 트랜잭션을 쓰지 않는다
// 테스트 프로필은 작업 자동 실행을 꺼 두므로 worker.pollOnce()로 직접 돌린다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class TripDeleteApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	@Autowired
	private JobWorker worker;

	private UUID ownerId;
	private UUID friendId;
	private UUID tripId;

	@BeforeEach
	void setUp() throws Exception {
		ownerId = insertUser("방장");
		friendId = insertUser("동행");
		tripId = createTrip("{\"title\":\"제주\",\"startDate\":\"2026-12-01\",\"endDate\":\"2026-12-02\"}");
		insertActiveMember(tripId, friendId, 2);
	}

	@Test
	void deletesTripImmediatelyAndCleansUpThroughJob() throws Exception {
		seedTripData();
		JsonNode ref = data(deleteTrip(ownerId, 1)
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.data.status").value("QUEUED"))
				.andExpect(jsonPath("$.data.jobId").isNotEmpty()));
		UUID jobId = UUID.fromString(ref.get("jobId").asString());
		assertThat(ref.get("statusUrl").asString()).isEqualTo("/api/v1/jobs/" + jobId);
		assertThat(jobId.version()).isEqualTo(7);

		// 작업이 돌기 전에도 여행은 모두에게 404이고 목록에서 빠진다
		assertThat(count("select count(*) from trips where id = ? and deleted_at is not null", tripId)).isEqualTo(1);
		expectTripNotFound(mockMvc.perform(get("/api/v1/trips/{tripId}", tripId).with(authUser(ownerId))));
		expectTripNotFound(mockMvc.perform(get("/api/v1/trips/{tripId}", tripId).with(authUser(friendId))));
		expectTripNotFound(mockMvc.perform(get("/api/v1/trips/{tripId}/chat-room", tripId).with(authUser(friendId))));
		expectTripNotFound(mockMvc.perform(get("/api/v1/trips/{tripId}/itinerary", tripId).with(authUser(friendId))));
		expectTripNotFound(deleteTrip(ownerId, 2));
		mockMvc.perform(get("/api/v1/me/trips").with(authUser(friendId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data", hasSize(0)));
		mockMvc.perform(get("/api/v1/chat/rooms").with(authUser(friendId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data", hasSize(0)));

		// 작업은 요청한 방장만 본다
		mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.kind").value("TRIP_DELETE"))
				.andExpect(jsonPath("$.data.status").value("QUEUED"))
				.andExpect(jsonPath("$.data.result").isEmpty());
		mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(friendId)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("JOB_NOT_FOUND"));

		runJob(jobId);

		// 하위 자료는 모두 지워지고 여행 행만 tombstone으로 남는다
		for (String table : List.of("trip_members", "trip_destinations", "chat_rooms", "itineraries",
				"checklist_items", "expenses", "trip_invitations", "settlements", "polls")) {
			assertThat(count("select count(*) from " + table + " where trip_id = ?", tripId)).as(table).isZero();
		}
		assertThat(count("select count(*) from messages m join chat_rooms r on r.id = m.room_id where r.trip_id = ?",
				tripId)).isZero();
		assertThat(count("select count(*) from trips where id = ? and deleted_at is not null", tripId)).isEqualTo(1);
		assertThat(count("select count(*) from jobs where trip_id = ? and applied_by_member_id is not null", tripId)).isZero();
		assertThat(count("select count(*) from jobs where trip_id = ?", tripId)).isEqualTo(2);
		mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("SUCCEEDED"))
				.andExpect(jsonPath("$.data.result.scope").value("TRIP_DELETE"))
				.andExpect(jsonPath("$.data.result.completedCount").value(1))
				.andExpect(jsonPath("$.data.result.failedCount").value(0))
				.andExpect(jsonPath("$.data.result.tripId").doesNotExist())
				.andExpect(jsonPath("$.data.error").isEmpty());
		// 다른 여행은 건드리지 않는다
		assertThat(count("select count(*) from users where id in (?, ?)", ownerId, friendId)).isEqualTo(2);
	}

	@Test
	void rejectsNonOwnerStaleVersionAndMissingInput() throws Exception {
		UUID stranger = insertUser("남");

		expectTripNotFound(deleteTrip(stranger, 1));
		expectTripNotFound(mockMvc.perform(delete("/api/v1/trips/{tripId}", UUID.randomUUID()).with(authUser(ownerId))
				.param("expectedVersion", "1")));
		deleteTrip(friendId, 1)
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
		deleteTrip(ownerId, 2)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
		mockMvc.perform(delete("/api/v1/trips/{tripId}", tripId).with(authUser(ownerId)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields[0].field").value("expectedVersion"));
		mockMvc.perform(delete("/api/v1/trips/{tripId}", tripId).with(authUser(ownerId)).param("expectedVersion", "x"))
				.andExpect(status().isBadRequest());
		mockMvc.perform(delete("/api/v1/trips/{tripId}", tripId).param("expectedVersion", "1"))
				.andExpect(status().isUnauthorized());

		// 실패한 요청은 아무것도 바꾸지 않는다
		assertThat(count("select count(*) from trips where id = ? and deleted_at is null", tripId)).isEqualTo(1);
		assertThat(count("select count(*) from jobs where trip_id = ?", tripId)).isZero();
		mockMvc.perform(get("/api/v1/trips/{tripId}", tripId).with(authUser(friendId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(1));
	}

	@Test
	void documentsDeleteApi() throws Exception {
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}'].delete.tags[0]").value("여행"))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}'].delete.responses['202']").exists())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}'].delete.responses['403'].description")
						.value(containsString("FORBIDDEN")))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}'].delete.responses['409'].description")
						.value(containsString("VERSION_CONFLICT")));
	}

	// 투표·코스·준비물·초대·채팅·정산을 하나씩 만들어 물리 삭제 범위를 확인한다
	private void seedTripData() throws Exception {
		UUID place = insertPlace();
		mockMvc.perform(post("/api/v1/trips/{tripId}/polls", tripId).with(authUser(friendId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"type\":\"PLACE\",\"title\":\"어디\",\"candidates\":[{\"placeId\":\"%s\"}],\"closesAt\":\"%s\"}"
								.formatted(place, Instant.now().plus(1, ChronoUnit.DAYS))))
				.andExpect(status().isCreated());
		mockMvc.perform(put("/api/v1/trips/{tripId}/itinerary", tripId).with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(("{\"expectedVersion\":1,\"items\":[{\"placeId\":\"%s\",\"day\":1,\"order\":1},{\"placeId\":\"%s\",\"day\":1,\"order\":2}],"
								+ "\"legs\":[{\"day\":1,\"fromOrder\":1,\"toOrder\":2,\"transportMode\":\"WALK\"}]}")
								.formatted(place, place)))
				.andExpect(status().isOk());
		mockMvc.perform(post("/api/v1/trips/{tripId}/checklist", tripId).with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"여권\"}"))
				.andExpect(status().isCreated());
		mockMvc.perform(post("/api/v1/trips/{tripId}/invitations", tripId).with(authUser(ownerId)))
				.andExpect(status().isCreated());
		UUID roomId = UUID.fromString(data(mockMvc.perform(get("/api/v1/trips/{tripId}/chat-room", tripId)
				.with(authUser(ownerId))).andExpect(status().isOk())).get("id").asString());
		mockMvc.perform(post("/api/v1/chat/rooms/{roomId}/messages", roomId).with(authUser(friendId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"clientMessageId\":\"%s\",\"text\":\"안녕\"}".formatted(UUID.randomUUID())))
				.andExpect(status().isCreated());
		UUID ownerMemberId = jdbcTemplate.queryForObject(
				"select id from trip_members where trip_id = ? and user_id = ?", UUID.class, tripId, ownerId);
		UUID friendMemberId = jdbcTemplate.queryForObject(
				"select id from trip_members where trip_id = ? and user_id = ?", UUID.class, tripId, friendId);
		mockMvc.perform(post("/api/v1/trips/{tripId}/expenses", tripId).with(authUser(ownerId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content(("{\"title\":\"저녁\",\"amountMinor\":10000,\"currency\":\"KRW\",\"payerMemberId\":\"%s\","
								+ "\"participantMemberIds\":[\"%s\",\"%s\"],\"spentAt\":\"2026-12-01T10:00:00Z\"}")
								.formatted(ownerMemberId, ownerMemberId, friendMemberId)))
				.andExpect(status().isCreated());
		mockMvc.perform(post("/api/v1/trips/{tripId}/settlements", tripId).with(authUser(ownerId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON).content("{\"expectedExpenseVersion\":1}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.transfers", hasSize(1)));
		assertThat(count("select count(*) from expense_shares s join expenses e on e.id = s.expense_id where e.trip_id = ?",
				tripId)).isEqualTo(2);
		// 멤버십을 가리키는 끝난 AI 작업(변경안 적용 기록)이 있어도 멤버십 삭제가 FK에 막히지 않아야 한다
		jdbcTemplate.update("""
				insert into jobs (id, requested_by_user_id, trip_id, kind, status, input_json, applied_by_member_id,
				    applied_at, next_attempt_at, created_at, finished_at)
				values (?, ?, ?, 'ITINERARY_PROPOSAL', 'SUCCEEDED', '{}'::jsonb, ?, now(), now(), now(), now())""",
				UUID.randomUUID(), friendId, tripId, friendMemberId);
		assertThat(count("select count(*) from trips where id = ? and current_settlement_id is not null", tripId))
				.isEqualTo(1);
	}

	// 다른 테스트가 남긴 작업이 먼저 선점될 수 있으므로 내 작업이 QUEUED를 벗어날 때까지 선점을 반복한다
	private void runJob(UUID jobId) {
		long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
		while (state(jobId).equals("QUEUED") && System.nanoTime() < until) {
			if (!worker.pollOnce()) {
				LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(20));
			}
		}
		while (!state(jobId).equals("SUCCEEDED") && System.nanoTime() < until) {
			LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(5));
		}
		assertThat(state(jobId)).isEqualTo("SUCCEEDED");
	}

	private String state(UUID jobId) {
		return jdbcTemplate.queryForObject("select status from jobs where id = ?", String.class, jobId);
	}

	private ResultActions deleteTrip(UUID userId, long expectedVersion) throws Exception {
		return mockMvc.perform(delete("/api/v1/trips/{tripId}", tripId).with(authUser(userId))
				.param("expectedVersion", String.valueOf(expectedVersion)));
	}

	private void expectTripNotFound(ResultActions result) throws Exception {
		result.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
	}

	private UUID createTrip(String body) throws Exception {
		return UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(ownerId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isCreated())).get("id").asString());
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
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

	private UUID insertActiveMember(UUID memberTripId, UUID userId, long joinOrder) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at)
				values (?, ?, ?, 'ACTIVE', ?, now())""", id, memberTripId, userId, joinOrder);
		// 채팅방 참여도 멤버십과 같이 맞춘다(초대 수락과 같은 상태)
		jdbcTemplate.update("""
				insert into chat_participants (room_id, user_id, joined_at)
				select id, ?, now() from chat_rooms where trip_id = ?""", userId, memberTripId);
		return id;
	}

	private UUID insertPlace() {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into places (id, name, latitude, longitude, source, created_at, updated_at)
				values (?, '장소', 33.4996213, 126.5311884, 'MANUAL', now(), now())""", id);
		return id;
	}

}
