package com.eodilog.itinerary.proposal;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
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
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

// AI 최초 코스 제안 요청 → 작업 실행 → 조회 → 적용 → 되돌리기(EODI-231). AI 서버는 가짜로 바꾸고 실제 jobs worker를 직접 돌린다
// 실제 AI(-150)는 아직 없어 AI spec §5 계약대로 만든 응답으로만 검증한다
// 테스트 DB는 다른 테스트 클래스와 공유한다. JobIntegrationTest가 jobs를 지우므로 끝날 때 내 undo 행과 작업을 지운다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ItineraryProposalApiTest {

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
		placeA = insertPlace("해운대해수욕장");
		placeB = insertPlace("동백섬");
		placeC = insertPlace("감천문화마을");
		savePlace(ownerId, tripId, placeA);
		savePlace(friendId, tripId, placeB);
		savePlace(ownerId, tripId, placeC);
		// 기본 AI 응답: 1일차 A→B(대중교통 22분), 2일차 C. 현재 코스에 있는 장소면 그 항목 id를 유지한다
		answerWith(this::proposal);
	}

	@AfterEach
	void cleanUp() {
		for (UUID trip : trips) {
			jdbcTemplate.update("""
					delete from itinerary_undo_states where itinerary_id in (select id from itineraries where trip_id = ?)""",
					trip);
			jdbcTemplate.update("delete from jobs where trip_id = ?", trip);
		}
	}

	@Test
	void requestsRunsAppliesAndUndoesProposal() throws Exception {
		// 현재 코스: 1일차 A 하나(version 2)
		UUID existingItemId = UUID.fromString(data(replaceCourse(ownerId, 1, """
				[{"placeId":"%s","day":1,"order":1,"startTime":"09:00","stayMinutes":60}]""".formatted(placeA), "[]")
				.andExpect(status().isOk())).get("items").get(0).get("id").asString());

		String key = UUID.randomUUID().toString();
		JsonNode ref = data(requestProposal(ownerId, tripId, key, "{\"reason\":\"INITIAL\",\"expectedVersion\":2}")
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.data.status").value("QUEUED")));
		UUID jobId = UUID.fromString(ref.get("jobId").asString());
		// 같은 키·같은 본문이면 새 작업을 만들지 않는다. 기본 이동 수단을 명시해도 같은 본문이다
		requestProposal(ownerId, tripId, key,
				"{\"reason\":\"INITIAL\",\"expectedVersion\":2,\"defaultTransportMode\":\"TRANSIT\"}")
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.data.jobId").value(jobId.toString()));
		assertThat(count("select count(*) from jobs where trip_id = ? and kind = 'ITINERARY_PROPOSAL'", tripId))
				.isEqualTo(1);

		runUntil(jobId, Set.of("SUCCEEDED"));

		// AI에 보낸 입력: 등록 때 고정한 기간·모은 장소(저장 순 + 코스 장소)·현재 코스·기본 수단(AI spec §5 요청)
		ArgumentCaptor<JsonNode> body = ArgumentCaptor.forClass(JsonNode.class);
		verify(aiServerClient).post(eq("/ai/v1/itinerary-proposals"), eq(jobId), body.capture());
		JsonNode sent = body.getValue();
		assertThat(sent.get("reason").asString()).isEqualTo("INITIAL");
		assertThat(sent.get("expectedVersion").asLong()).isEqualTo(2);
		assertThat(sent.get("trip").get("id").asString()).isEqualTo(tripId.toString());
		assertThat(sent.get("trip").get("startDate").asString()).isEqualTo("2026-11-14");
		assertThat(sent.get("trip").get("endDate").asString()).isEqualTo("2026-11-15");
		assertThat(sent.get("trip").get("destinationRegionIds").isArray()).isTrue();
		assertThat(ids(sent.get("places"))).containsExactly(placeA, placeB, placeC);
		assertThat(sent.get("places").get(0).get("name").asString()).isEqualTo("해운대해수욕장");
		assertThat(sent.get("current").get("items").size()).isEqualTo(1);
		assertThat(sent.get("current").get("items").get(0).get("id").asString()).isEqualTo(existingItemId.toString());
		assertThat(sent.get("current").get("legs").size()).isZero();
		assertThat(sent.get("defaultTransportMode").asString()).isEqualTo("TRANSIT");
		assertThat(sent.get("excludedPlaceIds").size()).isZero();
		assertThat(sent.get("selectedAlternative").isNull()).isTrue();

		// 공동 코스의 제안이라 요청하지 않은 멤버도 본다. 장소는 입력 값, diff는 백엔드가 다시 계산한 값이다
		getProposal(friendId, tripId, jobId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.job.status").value("SUCCEEDED"))
				.andExpect(jsonPath("$.data.baseVersion").value(2))
				.andExpect(jsonPath("$.data.reason").value("INITIAL"))
				.andExpect(jsonPath("$.data.proposed.items.length()").value(3))
				.andExpect(jsonPath("$.data.proposed.items[0].id").value(existingItemId.toString()))
				.andExpect(jsonPath("$.data.proposed.items[0].place.name").value("해운대해수욕장"))
				.andExpect(jsonPath("$.data.proposed.items[1].id").isEmpty())
				.andExpect(jsonPath("$.data.proposed.items[2].day").value(2))
				.andExpect(jsonPath("$.data.proposed.legs.length()").value(1))
				.andExpect(jsonPath("$.data.proposed.legs[0].fromItemId").value(existingItemId.toString()))
				.andExpect(jsonPath("$.data.proposed.legs[0].toItemId").isEmpty())
				.andExpect(jsonPath("$.data.proposed.legs[0].durationSeconds").value(1320))
				.andExpect(jsonPath("$.data.proposed.legs[0].distanceMeters").isEmpty())
				.andExpect(jsonPath("$.data.proposed.legs[0].status").value("AVAILABLE"))
				.andExpect(jsonPath("$.data.diff.addedPlaceIds.length()").value(2))
				.andExpect(jsonPath("$.data.diff.addedPlaceIds[0]").value(placeB.toString()))
				.andExpect(jsonPath("$.data.diff.removedPlaceIds.length()").value(0))
				.andExpect(jsonPath("$.data.diff.description").value("1일차 2곳, 2일차 1곳으로 짰어요"))
				.andExpect(jsonPath("$.data.appliedAt").isEmpty())
				.andExpect(jsonPath("$.data.canUndo").value(false));
		mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(friendId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.result.proposed.items.length()").value(3));
		// 적용 전에는 코스가 그대로다
		getCourse(ownerId).andExpect(jsonPath("$.data.version").value(2))
				.andExpect(jsonPath("$.data.items.length()").value(1));

		// 요청하지 않은 멤버도 적용한다. 기존 항목 id 유지, 새 항목 발급, AI 이동 시간 저장, version 증가
		JsonNode applied = data(apply(friendId, jobId, 2)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(3))
				.andExpect(jsonPath("$.data.items.length()").value(3))
				.andExpect(jsonPath("$.data.items[0].id").value(existingItemId.toString()))
				.andExpect(jsonPath("$.data.items[0].startTime").value("10:00"))
				.andExpect(jsonPath("$.data.legs[0].durationSeconds").value(1320))
				.andExpect(jsonPath("$.data.legs[0].distanceMeters").isEmpty())
				.andExpect(jsonPath("$.data.legs[0].status").value("AVAILABLE")));
		assertThat(applied.get("updatedByMemberId").asString()).isEqualTo(memberId(friendId).toString());
		getProposal(ownerId, tripId, jobId)
				.andExpect(jsonPath("$.data.appliedAt").isNotEmpty())
				.andExpect(jsonPath("$.data.canUndo").value(true));
		assertThat(count("select count(*) from jobs where id = ? and applied_by_member_id = ?", jobId,
				memberId(friendId))).isEqualTo(1);
		// 다른 멤버에게 코스 변경 알림
		assertThat(count("select count(*) from events where deduplication_key = ?",
				"COURSE_CHANGED:" + tripId + ":3")).isEqualTo(1);

		// 같은 제안은 한 번만 적용한다
		apply(ownerId, jobId, 3).andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("ALREADY_APPLIED"));

		// 되돌리기: 원래 항목 id 그대로 복원하고 version을 올린다. 적용하지 않은 멤버도 되돌릴 수 있다
		undo(ownerId, 3, jobId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(4))
				.andExpect(jsonPath("$.data.items.length()").value(1))
				.andExpect(jsonPath("$.data.items[0].id").value(existingItemId.toString()))
				.andExpect(jsonPath("$.data.items[0].startTime").value("09:00"))
				.andExpect(jsonPath("$.data.legs.length()").value(0));
		getProposal(ownerId, tripId, jobId).andExpect(jsonPath("$.data.canUndo").value(false));
		undo(ownerId, 4, jobId).andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("UNDO_UNAVAILABLE"));
		assertThat(count("select count(*) from itinerary_undo_states u join itineraries i on i.id = u.itinerary_id "
				+ "where i.trip_id = ?", tripId)).isZero();
	}

	@Test
	void rejectsInvalidRequests() throws Exception {
		// 키 없음
		expectValidationError(requestProposal(ownerId, tripId, null, "{\"reason\":\"INITIAL\",\"expectedVersion\":1}"),
				"Idempotency-Key");
		expectValidationError(request(ownerId, "{\"expectedVersion\":1}"), "reason");
		expectValidationError(request(ownerId, "{\"reason\":\"INITIAL\"}"), "expectedVersion");
		// 아직 지원하지 않는 사유와 다른 사유용 필드
		expectValidationError(request(ownerId, "{\"reason\":\"PLACE_REMOVED\",\"expectedVersion\":1}"), "reason");
		expectValidationError(request(ownerId,
				"{\"reason\":\"INITIAL\",\"expectedVersion\":1,\"excludedPlaceIds\":[]}"), "excludedPlaceIds");
		request(ownerId, "{\"reason\":\"INITIAL\",\"expectedVersion\":1,\"memo\":\"x\"}")
				.andExpect(status().isBadRequest());
		// 비멤버·나간 멤버
		UUID stranger = insertUser("남");
		request(stranger, "{\"reason\":\"INITIAL\",\"expectedVersion\":1}").andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
		// 오래된 코스 version
		request(ownerId, "{\"reason\":\"INITIAL\",\"expectedVersion\":7}").andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
		assertThat(count("select count(*) from jobs where trip_id = ? and kind = 'ITINERARY_PROPOSAL'", tripId))
				.isZero();
		verify(aiServerClient, never()).post(anyString(), any(), any());
	}

	@Test
	void rejectsMissingPeriodOrPlacesAndTooManyPlaces() throws Exception {
		UUID emptyTrip = createTrip(ownerId);
		jdbcTemplate.update("update trips set start_date = null, end_date = null where id = ?", emptyTrip);
		requestProposal(ownerId, emptyTrip, UUID.randomUUID().toString(), "{\"reason\":\"INITIAL\",\"expectedVersion\":1}")
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.error.code").value("INSUFFICIENT_DATA"))
				.andExpect(jsonPath("$.error.fields[0].field").value("trip.startDate"))
				.andExpect(jsonPath("$.error.fields[1].field").value("places"));

		// 모은 장소 201곳은 거부한다
		UUID crowded = createTrip(ownerId);
		String prefix = "많은장소-" + crowded;
		jdbcTemplate.update("""
				insert into places (id, name, latitude, longitude, source, created_at, updated_at)
				select gen_random_uuid(), ? || g, 35.1587, 129.1604, 'MANUAL', now(), now()
				from generate_series(1, ?) g""", prefix, ItineraryProposalService.MAX_PLACES + 1);
		jdbcTemplate.update("""
				insert into trip_place_saves (trip_id, place_id, saved_by_member_id, created_at, updated_at)
				select ?, p.id, m.id, now(), now() from places p
				join trip_members m on m.trip_id = ? and m.user_id = ?
				where p.name like ?""", crowded, crowded, ownerId, prefix + "%");
		requestProposal(ownerId, crowded, UUID.randomUUID().toString(), "{\"reason\":\"INITIAL\",\"expectedVersion\":1}")
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.error.code").value("INPUT_LIMIT_EXCEEDED"));
	}

	@Test
	void failsJobForInvalidAiResultAndBlocksApply() throws Exception {
		// 요청 places 밖의 장소를 넣은 응답은 받지 않는다(T-04-10)
		UUID outsider = insertPlace("모르는 곳");
		answerWith(input -> {
			ObjectNode data = proposal(input);
			((ObjectNode) data.get("proposed").get("items").get(0).get("place")).put("id", outsider.toString());
			return data;
		});
		UUID jobId = request(ownerId);
		runUntil(jobId, Set.of("FAILED"));
		getProposal(ownerId, tripId, jobId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.job.error.code").value("EXECUTION_FAILED"))
				.andExpect(jsonPath("$.data.proposed").isEmpty())
				.andExpect(jsonPath("$.data.diff.addedPlaceIds.length()").value(0));
		apply(ownerId, jobId, 1).andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("PROPOSAL_NOT_READY"));

		// 구간이 빠진 응답, 시간이 없는데 AVAILABLE인 응답, 여행 일수를 넘는 날짜도 실패다
		for (Function<JsonNode, ObjectNode> broken : List.<Function<JsonNode, ObjectNode>>of(
				input -> {
					ObjectNode data = proposal(input);
					((ArrayNode) data.get("proposed").get("legs")).removeAll();
					return data;
				},
				input -> {
					ObjectNode data = proposal(input);
					((ObjectNode) data.get("proposed").get("legs").get(0)).putNull("durationSeconds");
					return data;
				},
				input -> {
					ObjectNode data = proposal(input);
					((ObjectNode) data.get("proposed").get("items").get(2)).put("day", 3);
					return data;
				})) {
			answerWith(broken);
			UUID failed = request(ownerId);
			runUntil(failed, Set.of("FAILED"));
		}
	}

	@Test
	void truncatesLongDescriptionInsteadOfFailing() throws Exception {
		// 여행이 길면 AI 문구("N일차 M곳, ...")가 길어진다. 여행 기간 상한이 없어 실패시키지 않고 자른다
		answerWith(input -> {
			ObjectNode data = proposal(input);
			((ObjectNode) data.get("diff")).put("description", "가".repeat(StoredProposal.DESCRIPTION_MAX_LENGTH + 500));
			return data;
		});
		UUID jobId = request(ownerId);
		runUntil(jobId, Set.of("SUCCEEDED"));
		String description = data(getProposal(ownerId, tripId, jobId).andExpect(status().isOk()))
				.get("diff").get("description").asString();
		assertThat(description).hasSize(StoredProposal.DESCRIPTION_MAX_LENGTH).endsWith("…");
	}

	@Test
	void retriesTemporaryAiFailureButFailsAtOnceForClientError() throws Exception {
		doThrow(new AiServerException(true)).when(aiServerClient).post(anyString(), any(), any());
		UUID retried = request(ownerId);
		runUntilFailureRecorded(retried);
		assertThat(state(retried)).isEqualTo("QUEUED");

		doThrow(new AiServerException(false)).when(aiServerClient).post(anyString(), any(), any());
		UUID rejected = request(ownerId);
		runUntil(rejected, Set.of("FAILED"));
		assertThat(jdbcTemplate.queryForObject("select error_code from jobs where id = ?", String.class, rejected))
				.isEqualTo("EXECUTION_FAILED");
	}

	@Test
	void blocksStaleApplyAndUndoAfterOtherWrites() throws Exception {
		// 실행 중 수동 수정이 있으면 적용할 수 없다
		UUID stale = request(ownerId);
		replaceCourse(friendId, 1, """
				[{"placeId":"%s","day":1,"order":1}]""".formatted(placeC), "[]").andExpect(status().isOk());
		runUntil(stale, Set.of("SUCCEEDED"));
		apply(ownerId, stale, 2).andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
		apply(ownerId, stale, 1).andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));

		// 적용 뒤 바뀐 게 없는 PUT은 쓰기가 아니라 되돌릴 수 있다
		UUID fresh = request(ownerId, 2);
		runUntil(fresh, Set.of("SUCCEEDED"));
		JsonNode course = data(apply(ownerId, fresh, 2).andExpect(status().isOk()));
		replaceCourse(friendId, 3, items(course), legs(course)).andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(3));
		getProposal(ownerId, tripId, fresh).andExpect(jsonPath("$.data.canUndo").value(true));

		// 실제로 바꾼 PUT 뒤에는 되돌릴 수 없다
		replaceCourse(friendId, 3, "[]", "[]").andExpect(status().isOk());
		getProposal(ownerId, tripId, fresh).andExpect(jsonPath("$.data.canUndo").value(false));
		undo(ownerId, 4, fresh).andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("UNDO_UNAVAILABLE"));
		undo(ownerId, 3, fresh).andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
		expectValidationError(mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/undo", tripId)
				.with(authUser(ownerId)).contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":4}")),
				"appliedJobId");

		// 여행 기간이 줄어 제안 날짜가 넘치면 오래된 제안이다
		UUID shrunk = request(ownerId, 4);
		runUntil(shrunk, Set.of("SUCCEEDED"));
		jdbcTemplate.update("update trips set end_date = start_date where id = ?", tripId);
		apply(ownerId, shrunk, 4).andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
	}

	@Test
	void limitsAccessToCurrentMembersOfSameTrip() throws Exception {
		UUID jobId = request(ownerId);
		// 요청자가 실행 전에 나가면 실행하지 않고 취소한다
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where trip_id = ? and user_id = ?",
				tripId, ownerId);
		runUntil(jobId, Set.of("CANCELLED"));
		verify(aiServerClient, never()).post(anyString(), any(), any());
		getProposal(ownerId, tripId, jobId).andExpect(status().isNotFound());
		getProposal(friendId, tripId, jobId).andExpect(status().isOk())
				.andExpect(jsonPath("$.data.job.error.code").value("POLICY_REVOKED"));

		jdbcTemplate.update("update trip_members set status = 'ACTIVE', left_at = null where trip_id = ? and user_id = ?",
				tripId, ownerId);
		UUID succeeded = request(ownerId);
		runUntil(succeeded, Set.of("SUCCEEDED"));
		// 다른 여행 경로로는 보이지 않고 적용할 수도 없다
		UUID otherTrip = createTrip(friendId);
		getProposal(friendId, otherTrip, succeeded).andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("JOB_NOT_FOUND"));
		apply(friendId, otherTrip, succeeded, 1).andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("JOB_NOT_FOUND"));
		// 다른 종류의 작업 ID도 404
		UUID foreignKind = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into jobs (id, requested_by_user_id, trip_id, kind, status, input_json, next_attempt_at,
				    created_at, finished_at)
				values (?, ?, ?, 'CHECKLIST_SUGGESTIONS', 'SUCCEEDED', '{}'::jsonb, now(), now(), now())""",
				foreignKind, ownerId, tripId);
		getProposal(ownerId, tripId, foreignKind).andExpect(status().isNotFound());
		apply(ownerId, foreignKind, 1).andExpect(status().isNotFound());
		// 비멤버는 여행부터 없다
		apply(insertUser("남"), succeeded, 1).andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
	}

	@Test
	void appliesSameProposalOnlyOnceUnderConcurrency() throws Exception {
		UUID jobId = request(ownerId);
		runUntil(jobId, Set.of("SUCCEEDED"));
		ExecutorService executor = Executors.newFixedThreadPool(2);
		try {
			CountDownLatch start = new CountDownLatch(1);
			List<Future<MockHttpServletResponse>> results = new ArrayList<>();
			for (UUID user : List.of(ownerId, friendId)) {
				results.add(executor.submit(() -> {
					start.await();
					return apply(user, jobId, 1).andReturn().getResponse();
				}));
			}
			start.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (Future<MockHttpServletResponse> result : results) {
				statuses.add(result.get(20, TimeUnit.SECONDS).getStatus());
			}
			assertThat(statuses).containsExactlyInAnyOrder(200, 409);
		} finally {
			executor.shutdownNow();
		}
		getCourse(ownerId).andExpect(jsonPath("$.data.version").value(2))
				.andExpect(jsonPath("$.data.items.length()").value(3));
	}

	@Test
	void deletesTripWithAppliedProposal() throws Exception {
		UUID jobId = request(ownerId);
		runUntil(jobId, Set.of("SUCCEEDED"));
		apply(ownerId, jobId, 1).andExpect(status().isOk());

		JsonNode ref = data(mockMvc.perform(delete("/api/v1/trips/{tripId}", tripId).with(authUser(ownerId))
				.param("expectedVersion", "1")).andExpect(status().isAccepted()));
		UUID deleteJob = UUID.fromString(ref.get("jobId").asString());
		runUntil(deleteJob, Set.of("SUCCEEDED"));
		assertThat(count("select count(*) from itineraries where trip_id = ?", tripId)).isZero();
		assertThat(count("select count(*) from itinerary_undo_states u where not exists "
				+ "(select 1 from itineraries i where i.id = u.itinerary_id)")).isZero();
	}

	@Test
	void documentsProposalApisInSwagger() throws Exception {
		String base = "$.paths['/api/v1/trips/{tripId}/itinerary";
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath(base + "/proposals'].post.tags[0]").value("코스"))
				.andExpect(jsonPath(base + "/proposals'].post.responses['202']").exists())
				.andExpect(jsonPath(base + "/proposals'].post.responses['422'].description")
						.value(org.hamcrest.Matchers.containsString("INSUFFICIENT_DATA")))
				.andExpect(jsonPath(base + "/proposals/{jobId}'].get.responses['200']").exists())
				.andExpect(jsonPath(base + "/proposals/{jobId}/apply'].post.responses['409'].description")
						.value(org.hamcrest.Matchers.containsString("PROPOSAL_NOT_READY")))
				.andExpect(jsonPath(base + "/undo'].post.responses['409'].description")
						.value(org.hamcrest.Matchers.containsString("UNDO_UNAVAILABLE")))
				.andExpect(jsonPath("$.components.schemas.ItineraryProposalResponse.properties.canUndo").exists())
				.andExpect(jsonPath("$.components.schemas.ProposedLeg.properties.fromOrder").exists());
	}

	// AI spec §5 응답 모양. 입력 places 순서대로 1일차 2곳, 2일차 1곳. 현재 코스에 같은 장소가 있으면 그 항목 id를 유지한다
	private ObjectNode proposal(JsonNode input) {
		ObjectNode data = jsonMapper.createObjectNode();
		data.put("baseVersion", input.get("expectedVersion").asLong());
		data.put("reason", "INITIAL");
		ObjectNode proposed = data.putObject("proposed");
		ArrayNode items = proposed.putArray("items");
		int[][] positions = {{1, 1}, {1, 2}, {2, 1}};
		String[] times = {"10:00", "13:00", "10:00"};
		for (int i = 0; i < 3; i++) {
			JsonNode place = input.get("places").get(i);
			ObjectNode item = items.addObject();
			String existingId = null;
			for (JsonNode current : input.get("current").get("items")) {
				if (current.get("place").get("id").asString().equals(place.get("id").asString())) {
					existingId = current.get("id").asString();
				}
			}
			item.put("id", existingId);
			item.set("place", place.deepCopy());
			item.put("day", positions[i][0]);
			item.put("order", positions[i][1]);
			item.put("startTime", times[i]);
			item.put("stayMinutes", 120);
		}
		ObjectNode leg = proposed.putArray("legs").addObject();
		leg.putNull("fromItemId");
		leg.putNull("toItemId");
		leg.put("day", 1);
		leg.put("fromOrder", 1);
		leg.put("toOrder", 2);
		leg.put("transportMode", "TRANSIT");
		leg.put("durationSeconds", 1320);
		leg.putNull("distanceMeters");
		leg.putNull("geometry");
		leg.put("status", "AVAILABLE");
		leg.put("queriedAt", "2026-11-09T03:00:00Z");
		ObjectNode diff = data.putObject("diff");
		diff.putArray("removedPlaceIds");
		diff.putArray("addedPlaceIds");
		diff.put("description", "1일차 2곳, 2일차 1곳으로 짰어요");
		data.putNull("appliedAt");
		data.put("canUndo", false);
		return data;
	}

	private void answerWith(Function<JsonNode, ObjectNode> answer) {
		doAnswer(invocation -> answer.apply(invocation.getArgument(2, JsonNode.class)))
				.when(aiServerClient).post(anyString(), any(), any());
	}

	private UUID request(UUID userId) throws Exception {
		return request(userId, 1);
	}

	private UUID request(UUID userId, long expectedVersion) throws Exception {
		JsonNode ref = data(request(userId, "{\"reason\":\"INITIAL\",\"expectedVersion\":" + expectedVersion + "}")
				.andExpect(status().isAccepted()));
		return UUID.fromString(ref.get("jobId").asString());
	}

	private ResultActions request(UUID userId, String body) throws Exception {
		return requestProposal(userId, tripId, UUID.randomUUID().toString(), body);
	}

	private ResultActions requestProposal(UUID userId, UUID trip, String key, String body) throws Exception {
		var request = post("/api/v1/trips/{tripId}/itinerary/proposals", trip).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON).content(body);
		if (key != null) {
			request.header(IdempotencyService.HEADER_NAME, key);
		}
		return mockMvc.perform(request);
	}

	private ResultActions getProposal(UUID userId, UUID trip, UUID jobId) throws Exception {
		return mockMvc.perform(get("/api/v1/trips/{tripId}/itinerary/proposals/{jobId}", trip, jobId)
				.with(authUser(userId)));
	}

	private ResultActions apply(UUID userId, UUID jobId, long expectedVersion) throws Exception {
		return apply(userId, tripId, jobId, expectedVersion);
	}

	private ResultActions apply(UUID userId, UUID trip, UUID jobId, long expectedVersion) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/proposals/{jobId}/apply", trip, jobId)
				.with(authUser(userId)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"expectedVersion\":" + expectedVersion + "}"));
	}

	private ResultActions undo(UUID userId, long expectedVersion, UUID jobId) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/undo", tripId).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"expectedVersion\":%d,\"appliedJobId\":\"%s\"}".formatted(expectedVersion, jobId)));
	}

	private ResultActions getCourse(UUID userId) throws Exception {
		return mockMvc.perform(get("/api/v1/trips/{tripId}/itinerary", tripId).with(authUser(userId)));
	}

	private ResultActions replaceCourse(UUID userId, long expectedVersion, String items, String legs) throws Exception {
		return mockMvc.perform(put("/api/v1/trips/{tripId}/itinerary", tripId).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"expectedVersion\":%d,\"items\":%s,\"legs\":%s}".formatted(expectedVersion, items, legs)));
	}

	// 조회한 코스를 그대로 PUT 본문으로 바꾼다
	private String items(JsonNode course) {
		ArrayNode items = jsonMapper.createArrayNode();
		for (JsonNode item : course.get("items")) {
			items.addObject().put("id", item.get("id").asString()).put("placeId", item.get("place").get("id").asString())
					.put("day", item.get("day").asInt()).put("order", item.get("order").asInt())
					.put("startTime", item.get("startTime").asString())
					.put("stayMinutes", item.get("stayMinutes").asInt());
		}
		return items.toString();
	}

	private String legs(JsonNode course) {
		ArrayNode legs = jsonMapper.createArrayNode();
		for (JsonNode leg : course.get("legs")) {
			JsonNode from = null;
			for (JsonNode item : course.get("items")) {
				if (item.get("id").asString().equals(leg.get("fromItemId").asString())) {
					from = item;
				}
			}
			legs.addObject().put("day", from.get("day").asInt()).put("fromOrder", from.get("order").asInt())
					.put("toOrder", from.get("order").asInt() + 1)
					.put("transportMode", leg.get("transportMode").asString());
		}
		return legs.toString();
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

	private List<UUID> ids(JsonNode places) {
		List<UUID> ids = new ArrayList<>();
		places.forEach(place -> ids.add(UUID.fromString(place.get("id").asString())));
		return ids;
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

	private void savePlace(UUID userId, UUID trip, UUID placeId) throws Exception {
		mockMvc.perform(put("/api/v1/trips/{tripId}/saved-places/{placeId}/me", trip, placeId).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isOk());
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

	private long count(String sql, Object... args) {
		return jdbcTemplate.queryForObject(sql, Long.class, args);
	}

	private UUID memberId(UUID userId) {
		return jdbcTemplate.queryForObject("select id from trip_members where trip_id = ? and user_id = ?", UUID.class,
				tripId, userId);
	}

	private UUID insertUser(String nickname) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, ?, true, now(), now())""", id, nickname);
		return id;
	}

	private void insertMember(UUID trip, UUID userId, long joinOrder, String status) {
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at, left_at)
				values (?, ?, ?, ?, ?, now(), case when ? = 'ACTIVE' then null else now() end)""",
				UUID.randomUUID(), trip, userId, status, joinOrder, status);
	}

	private UUID insertPlace(String name) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into places (id, name, latitude, longitude, source, created_at, updated_at)
				values (?, ?, 35.1587, 129.1604, 'MANUAL', now(), now())""", id, name);
		return id;
	}

}
