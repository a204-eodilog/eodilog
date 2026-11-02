package com.eodilog.poll.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.poll.service.PollAutoCloser;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
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
// 방장(참여 순 1)·동행(2)이 ACTIVE인 여행에서 확인한다. 마감은 closes_at을 SQL로 지난 시각으로 바꿔 만든다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class PollApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	@Autowired
	private PollAutoCloser pollAutoCloser;

	private UUID ownerId;
	private UUID friendId;
	private UUID tripId;
	private UUID friendMemberId;

	@BeforeEach
	void setUp() throws Exception {
		ownerId = insertUser("방장");
		friendId = insertUser("동행");
		tripId = createTrip("{\"title\":\"제주\"}");
		friendMemberId = insertMember(tripId, friendId, 2, "ACTIVE");
	}

	@Test
	void opensPlacePollAndShowsItInListAndDetail() throws Exception {
		UUID first = insertPlace();
		UUID second = insertPlace();
		String closesAt = Instant.now().plus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS).toString();

		JsonNode poll = data(createPoll(friendId, """
				{"type":"PLACE","title":"  첫날 저녁  ","candidates":[{"placeId":"%s"},{"placeId":"%s"}],"closesAt":"%s"}
				""".formatted(second, first, closesAt))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.tripId").value(tripId.toString()))
				.andExpect(jsonPath("$.data.type").value("PLACE"))
				.andExpect(jsonPath("$.data.title").value("첫날 저녁"))
				.andExpect(jsonPath("$.data.status").value("OPEN"))
				.andExpect(jsonPath("$.data.version").value(1))
				.andExpect(jsonPath("$.data.closesAt").value(closesAt))
				.andExpect(jsonPath("$.data.closedReason").isEmpty())
				.andExpect(jsonPath("$.data.eligibleMemberCount").value(2))
				.andExpect(jsonPath("$.data.votedMemberCount").value(0))
				// 입력한 순서를 지킨다
				.andExpect(jsonPath("$.data.candidates[*].placeId", contains(second.toString(), first.toString())))
				.andExpect(jsonPath("$.data.candidates[0].regionId").isEmpty())
				.andExpect(jsonPath("$.data.candidates[0].voteCount").value(0))
				.andExpect(jsonPath("$.data.myCandidateIds", hasSize(0)))
				.andExpect(jsonPath("$.data.selectedCandidateIds", hasSize(0))));
		UUID pollId = id(poll);
		assertThat(pollId.version()).isEqualTo(7);

		mockMvc.perform(get("/api/v1/trips/{tripId}/polls", tripId).with(authUser(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data", hasSize(1)))
				.andExpect(jsonPath("$.data[0].id").value(pollId.toString()))
				.andExpect(jsonPath("$.page.hasNext").value(false));
		getPoll(ownerId, pollId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.candidates", hasSize(2)));
	}

	@Test
	void listsNewestFirstWithCursor() throws Exception {
		UUID older = id(data(createPoll(ownerId, placePoll(insertPlace()))));
		UUID newer = id(data(createPoll(ownerId, placePoll(insertPlace()))));

		JsonNode firstPage = body(mockMvc.perform(get("/api/v1/trips/{tripId}/polls", tripId).with(authUser(ownerId))
						.param("limit", "1"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[0].id").value(newer.toString()))
				.andExpect(jsonPath("$.page.hasNext").value(true)));
		mockMvc.perform(get("/api/v1/trips/{tripId}/polls", tripId).with(authUser(ownerId))
						.param("limit", "1").param("cursor", firstPage.get("page").get("nextCursor").asString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[0].id").value(older.toString()))
				.andExpect(jsonPath("$.page.hasNext").value(false));
	}

	@Test
	void rejectsInvalidPollInput() throws Exception {
		UUID place = insertPlace();
		UUID region = insertRegion();
		String future = Instant.now().plus(1, ChronoUnit.DAYS).toString();

		expectField(createPoll(ownerId, """
				{"title":"t","candidates":[{"placeId":"%s"}],"closesAt":"%s"}""".formatted(place, future)), "type");
		expectField(createPoll(ownerId, """
				{"type":"PLACE","title":"  ","candidates":[{"placeId":"%s"}],"closesAt":"%s"}""".formatted(place, future)),
				"title");
		expectField(createPoll(ownerId, """
				{"type":"PLACE","title":"t","candidates":[],"closesAt":"%s"}""".formatted(future)), "candidates");
		// 마감은 필수이고 미래·30일 이내여야 한다
		expectField(createPoll(ownerId, """
				{"type":"PLACE","title":"t","candidates":[{"placeId":"%s"}]}""".formatted(place)), "closesAt");
		expectField(createPoll(ownerId, """
				{"type":"PLACE","title":"t","candidates":[{"placeId":"%s"}],"closesAt":"%s"}"""
				.formatted(place, Instant.now().minusSeconds(1))), "closesAt");
		expectField(createPoll(ownerId, """
				{"type":"PLACE","title":"t","candidates":[{"placeId":"%s"}],"closesAt":"%s"}"""
				.formatted(place, Instant.now().plus(31, ChronoUnit.DAYS))), "closesAt");
		// 유형과 맞지 않는 후보·중복·없는 장소
		expectField(createPoll(ownerId, """
				{"type":"PLACE","title":"t","candidates":[{"regionId":"%s"}],"closesAt":"%s"}""".formatted(region, future)),
				"candidates[0]");
		expectField(createPoll(ownerId, """
				{"type":"PLACE","title":"t","candidates":[{"placeId":"%s","regionId":"%s"}],"closesAt":"%s"}"""
				.formatted(place, region, future)), "candidates[0]");
		expectField(createPoll(ownerId, """
				{"type":"PLACE","title":"t","candidates":[{"placeId":"%s"},{"placeId":"%s"}],"closesAt":"%s"}"""
				.formatted(place, place, future)), "candidates");
		expectField(createPoll(ownerId, """
				{"type":"PLACE","title":"t","candidates":[{"placeId":"%s"},{"placeId":"%s"}],"closesAt":"%s"}"""
				.formatted(place, UUID.randomUUID(), future)), "candidates[1]");
		expectField(createPoll(ownerId, """
				{"type":"REGION","title":"t","candidates":[{"regionId":"%s"}],"closesAt":"%s"}"""
				.formatted(UUID.randomUUID(), future)), "candidates[0]");
		assertThat(count("select count(*) from polls where trip_id = ?", tripId)).isZero();
	}

	@Test
	void hidesPollsFromNonMembersAndOtherTrips() throws Exception {
		UUID pollId = id(data(createPoll(ownerId, placePoll(insertPlace()))));
		UUID stranger = insertUser("모르는 사람");
		UUID leaverId = insertUser("나간 동행");
		insertMember(tripId, leaverId, 3, "LEFT");

		expectTripNotFound(getPoll(stranger, pollId));
		expectTripNotFound(getPoll(leaverId, pollId));
		expectTripNotFound(createPoll(stranger, placePoll(insertPlace())));
		expectTripNotFound(ballot(leaverId, pollId, "[]", 1));

		// 다른 여행의 투표는 없는 투표와 같다
		UUID otherTripId = createTrip("{\"title\":\"부산\"}");
		mockMvc.perform(get("/api/v1/trips/{tripId}/polls/{pollId}", otherTripId, pollId).with(authUser(ownerId)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("POLL_NOT_FOUND"));
		mockMvc.perform(put("/api/v1/trips/{tripId}/polls/{pollId}/ballot", otherTripId, pollId).with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"candidateIds\":[],\"expectedVersion\":1}"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("POLL_NOT_FOUND"));
	}

	@Test
	void replacesBallotWithoutBumpingVersion() throws Exception {
		JsonNode poll = data(createPoll(ownerId, placePoll(insertPlace(), insertPlace())));
		UUID pollId = id(poll);
		String first = candidateId(poll, 0);
		String second = candidateId(poll, 1);

		ballot(ownerId, pollId, "[\"%s\",\"%s\"]".formatted(second, first), 1)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.myCandidateIds", contains(first, second)));
		// 다른 사람이 투표해도 version이 오르지 않아 내가 본 version 1로 그대로 투표한다
		ballot(friendId, pollId, "[\"%s\"]".formatted(first), 1)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(1))
				.andExpect(jsonPath("$.data.candidates[0].voteCount").value(2))
				.andExpect(jsonPath("$.data.candidates[1].voteCount").value(1))
				.andExpect(jsonPath("$.data.votedMemberCount").value(2))
				.andExpect(jsonPath("$.data.myCandidateIds", contains(first)));
		// 빈 배열은 취소
		ballot(ownerId, pollId, "[]", 1)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.myCandidateIds", hasSize(0)))
				.andExpect(jsonPath("$.data.candidates[1].voteCount").value(0))
				.andExpect(jsonPath("$.data.votedMemberCount").value(1));

		expectField(ballot(ownerId, pollId, "[\"%s\",\"%s\"]".formatted(first, first), 1), "candidateIds");
		expectField(ballot(ownerId, pollId, "[\"%s\"]".formatted(UUID.randomUUID()), 1), "candidateIds");
		expectField(mockMvc.perform(put("/api/v1/trips/{tripId}/polls/{pollId}/ballot", tripId, pollId)
				.with(authUser(ownerId)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"candidateIds\":[]}")), "expectedVersion");
	}

	@Test
	void countsOnlyActiveMembersVotes() throws Exception {
		JsonNode poll = data(createPoll(ownerId, placePoll(insertPlace())));
		UUID pollId = id(poll);
		String candidate = candidateId(poll, 0);
		ballot(ownerId, pollId, "[\"%s\"]".formatted(candidate), 1).andExpect(status().isOk());
		ballot(friendId, pollId, "[\"%s\"]".formatted(candidate), 1).andExpect(status().isOk());

		// 나간 멤버의 표는 남기되 세지 않는다
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where id = ?", friendMemberId);
		getPoll(ownerId, pollId)
				.andExpect(jsonPath("$.data.eligibleMemberCount").value(1))
				.andExpect(jsonPath("$.data.votedMemberCount").value(1))
				.andExpect(jsonPath("$.data.candidates[0].voteCount").value(1));
		assertThat(count("select count(*) from poll_votes where member_id = ?", friendMemberId)).isEqualTo(1);

		// 다시 들어오면 다시 센다. 투표 중에 들어온 동행도 투표할 수 있다
		jdbcTemplate.update("update trip_members set status = 'ACTIVE', left_at = null where id = ?", friendMemberId);
		UUID newcomerId = insertUser("새 동행");
		insertMember(tripId, newcomerId, 3, "ACTIVE");
		ballot(newcomerId, pollId, "[\"%s\"]".formatted(candidate), 1)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.eligibleMemberCount").value(3))
				.andExpect(jsonPath("$.data.votedMemberCount").value(3))
				.andExpect(jsonPath("$.data.candidates[0].voteCount").value(3));
	}

	@Test
	void addsCandidateAndBumpsVersion() throws Exception {
		UUID first = insertPlace();
		UUID pollId = id(data(createPoll(ownerId, placePoll(first))));
		UUID second = insertPlace();

		addCandidate(friendId, pollId, "{\"placeId\":\"%s\"}".formatted(second), 1)
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.version").value(2))
				.andExpect(jsonPath("$.data.candidates[*].placeId", contains(first.toString(), second.toString())));

		// 후보가 추가돼 예전 화면(version 1)의 투표·추가는 409
		expectCode(ballot(ownerId, pollId, "[]", 1), 409, "VERSION_CONFLICT");
		expectCode(addCandidate(ownerId, pollId, "{\"placeId\":\"%s\"}".formatted(insertPlace()), 1), 409,
				"VERSION_CONFLICT");
		expectField(addCandidate(ownerId, pollId, "{\"placeId\":\"%s\"}".formatted(second), 2), "candidate");
		expectField(addCandidate(ownerId, pollId, "{\"regionId\":\"%s\"}".formatted(insertRegion()), 2), "candidate");
		expectField(addCandidate(ownerId, pollId, "{\"placeId\":\"%s\"}".formatted(UUID.randomUUID()), 2), "candidate");
		expectField(addCandidate(ownerId, pollId, "{}", 2), "candidate");
	}

	@Test
	void limitsCandidatesToThirty() throws Exception {
		List<UUID> places = new ArrayList<>();
		for (int i = 0; i < 31; i++) {
			places.add(insertPlace());
		}
		expectField(createPoll(ownerId, placePoll(places.toArray(UUID[]::new))), "candidates");
		UUID pollId = id(data(createPoll(ownerId, placePoll(places.subList(0, 30).toArray(UUID[]::new)))
				.andExpect(status().isCreated())));
		expectField(addCandidate(ownerId, pollId, "{\"placeId\":\"%s\"}".formatted(places.get(30)), 1), "candidate");
	}

	@Test
	void closesLazilyAndFinalizesAllTiedCandidates() throws Exception {
		JsonNode poll = data(createPoll(ownerId, placePoll(insertPlace(), insertPlace(), insertPlace())));
		UUID pollId = id(poll);
		String first = candidateId(poll, 0);
		String second = candidateId(poll, 1);
		ballot(ownerId, pollId, "[\"%s\"]".formatted(first), 1).andExpect(status().isOk());
		ballot(friendId, pollId, "[\"%s\"]".formatted(second), 1).andExpect(status().isOk());
		expire(pollId);

		getPoll(friendId, pollId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("FINALIZED"))
				.andExpect(jsonPath("$.data.closedReason").value("DEADLINE"))
				.andExpect(jsonPath("$.data.version").value(2))
				.andExpect(jsonPath("$.data.selectedCandidateIds", contains(first, second)))
				.andExpect(jsonPath("$.data.myCandidateIds", contains(second)));
		assertThat(count("select count(*) from poll_results r join poll_candidates c on c.id = r.candidate_id"
				+ " where c.poll_id = ?", pollId)).isEqualTo(2);

		expectCode(ballot(ownerId, pollId, "[]", 2), 409, "POLL_CLOSED");
		expectCode(addCandidate(ownerId, pollId, "{\"placeId\":\"%s\"}".formatted(insertPlace()), 2), 409,
				"POLL_CLOSED");

		// 마감 뒤 멤버가 나가도 결과와 집계는 그대로다
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where id = ?", friendMemberId);
		getPoll(ownerId, pollId)
				.andExpect(jsonPath("$.data.eligibleMemberCount").value(2))
				.andExpect(jsonPath("$.data.votedMemberCount").value(2))
				.andExpect(jsonPath("$.data.candidates[1].voteCount").value(1))
				.andExpect(jsonPath("$.data.selectedCandidateIds", hasSize(2)));
	}

	@Test
	void rejectsWritesAtDeadlineEvenBeforeAnyRead() throws Exception {
		UUID pollId = id(data(createPoll(ownerId, placePoll(insertPlace()))));
		expire(pollId);

		// 쓰기 요청이 먼저 마감을 커밋한 뒤 거부한다. 409로 끝나도 마감은 남는다. 0표라 확정 없이 마감
		expectCode(ballot(ownerId, pollId, "[]", 1), 409, "POLL_CLOSED");
		assertThat(jdbcTemplate.queryForObject("select status from polls where id = ?", String.class, pollId))
				.isEqualTo("CLOSED");
		getPoll(ownerId, pollId)
				.andExpect(jsonPath("$.data.status").value("CLOSED"))
				.andExpect(jsonPath("$.data.closedReason").value("NO_VOTES"))
				.andExpect(jsonPath("$.data.votedMemberCount").value(0))
				.andExpect(jsonPath("$.data.selectedCandidateIds", hasSize(0)));
	}

	@Test
	void closesBeforeMembershipChanges() throws Exception {
		// 마감 시각 전에 던진 표는 그 뒤 나가기·내보내기·새 참여가 먼저 처리돼도 마감 결과에 들어간다
		JsonNode poll = data(createPoll(ownerId, placePoll(insertPlace())));
		UUID pollId = id(poll);
		ballot(ownerId, pollId, "[\"%s\"]".formatted(candidateId(poll, 0)), 1).andExpect(status().isOk());
		expire(pollId);

		// API로 만든 방장만 채팅 참여 행이 있어 나가기를 할 수 있다. 방장이 나가면 동행이 방장이 된다
		mockMvc.perform(post("/api/v1/trips/{tripId}/leave", tripId).with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"deleteOwnPhotos\":false,\"deleteOwnMessages\":false,\"expectedVersion\":%d}"
								.formatted(count("select version from trips where id = ?", tripId))))
				.andExpect(status().isOk());

		assertThat(jdbcTemplate.queryForObject("select status from polls where id = ?", String.class, pollId))
				.isEqualTo("FINALIZED");
		getPoll(friendId, pollId)
				.andExpect(jsonPath("$.data.eligibleMemberCount").value(2))
				.andExpect(jsonPath("$.data.votedMemberCount").value(1))
				.andExpect(jsonPath("$.data.selectedCandidateIds", hasSize(1)));
	}

	@Test
	void closesRegionPollsOnceUnderConcurrency() throws Exception {
		// 같은 여행에 마감 지난 지역 투표 두 개. 동시에 마감해도 여행지는 한 번씩만 붙고 version은 투표마다 1씩만 오른다
		UUID busan = insertRegion();
		UUID seoul = insertRegion();
		List<UUID> pollIds = new ArrayList<>();
		for (UUID region : List.of(busan, seoul)) {
			JsonNode poll = data(createPoll(ownerId, """
					{"type":"REGION","title":"어디로","candidates":[{"regionId":"%s"}],"closesAt":"%s"}"""
					.formatted(region, Instant.now().plus(1, ChronoUnit.HOURS))));
			ballot(ownerId, id(poll), "[\"%s\"]".formatted(candidateId(poll, 0)), 1).andExpect(status().isOk());
			pollIds.add(id(poll));
		}
		// 투표가 모두 끝난 뒤 한꺼번에 마감 시각을 넘긴다. 중간에 넘기면 다음 투표 요청이 먼저 마감한다
		pollIds.forEach(this::expire);
		long versionBefore = count("select version from trips where id = ?", tripId);

		ExecutorService executor = Executors.newFixedThreadPool(4);
		CountDownLatch start = new CountDownLatch(1);
		List<Future<Integer>> results = new ArrayList<>();
		try {
			for (int i = 0; i < 4; i++) {
				boolean auto = i % 2 == 0;
				results.add(executor.submit(() -> {
					start.await();
					if (auto) {
						pollAutoCloser.closeDuePolls();
						return 200;
					}
					return mockMvc.perform(get("/api/v1/trips/{tripId}/polls", tripId).with(authUser(friendId)))
							.andReturn().getResponse().getStatus();
				}));
			}
			start.countDown();
			for (Future<Integer> result : results) {
				assertThat(result.get()).isEqualTo(200);
			}
		} finally {
			executor.shutdownNow();
		}

		assertThat(count("select version from trips where id = ?", tripId)).isEqualTo(versionBefore + 2);
		assertThat(jdbcTemplate.queryForList(
				"select region_id from trip_destinations where trip_id = ? order by display_order", UUID.class, tripId))
				.containsExactlyInAnyOrder(busan, seoul);
	}

	@Test
	void lazyCloseOnReadAlsoAppendsDestinations() throws Exception {
		// 조회는 권한 검사에서 잠금 없이 여행을 읽는다. 지연 마감이 잠근 뒤 다시 읽은 여행에 version을 올리는지 확인한다
		UUID busan = insertRegion();
		JsonNode poll = data(createPoll(ownerId, """
				{"type":"REGION","title":"어디로","candidates":[{"regionId":"%s"}],"closesAt":"%s"}"""
				.formatted(busan, Instant.now().plus(1, ChronoUnit.HOURS))));
		UUID pollId = id(poll);
		ballot(friendId, pollId, "[\"%s\"]".formatted(candidateId(poll, 0)), 1).andExpect(status().isOk());
		jdbcTemplate.update("update trips set version = 5 where id = ?", tripId);
		expire(pollId);

		mockMvc.perform(get("/api/v1/trips/{tripId}/polls", tripId).with(authUser(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[0].status").value("FINALIZED"));
		mockMvc.perform(get("/api/v1/trips/{tripId}", tripId).with(authUser(ownerId)))
				.andExpect(jsonPath("$.data.version").value(6))
				.andExpect(jsonPath("$.data.destinationRegionIds", contains(busan.toString())));
	}

	@Test
	void finalizedRegionPollAppendsDestinations() throws Exception {
		UUID jeju = insertRegion();
		UUID busan = insertRegion();
		UUID seoul = insertRegion();
		UUID regionTripId = createTrip("{\"title\":\"남쪽\",\"destinationRegionIds\":[\"%s\"]}".formatted(jeju));
		insertMember(regionTripId, friendId, 2, "ACTIVE");
		JsonNode poll = data(mockMvc.perform(post("/api/v1/trips/{tripId}/polls", regionTripId).with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"type":"REGION","title":"어디로","candidates":[{"regionId":"%s"},{"regionId":"%s"},{"regionId":"%s"}],
								 "closesAt":"%s"}""".formatted(busan, jeju, seoul, Instant.now().plus(1, ChronoUnit.HOURS))))
				.andExpect(status().isCreated()));
		UUID pollId = id(poll);
		String busanCandidate = candidateId(poll, 0);
		String jejuCandidate = candidateId(poll, 1);
		vote(ownerId, regionTripId, pollId, "[\"%s\",\"%s\"]".formatted(busanCandidate, jejuCandidate));
		vote(friendId, regionTripId, pollId, "[\"%s\",\"%s\"]".formatted(busanCandidate, jejuCandidate));
		expire(pollId);

		// 아무도 조회하지 않아도 주기 마감이 확정하고 여행지에 붙인다. 이미 있는 제주는 건너뛴다
		assertThat(pollAutoCloser.closeDuePolls()).isGreaterThanOrEqualTo(1);
		mockMvc.perform(get("/api/v1/trips/{tripId}", regionTripId).with(authUser(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(2))
				.andExpect(jsonPath("$.data.destinationRegionIds", contains(jeju.toString(), busan.toString())));
		assertThat(jdbcTemplate.queryForObject(
				"select source_candidate_id::text from trip_destinations where trip_id = ? and region_id = ?",
				String.class, regionTripId, busan)).isEqualTo(busanCandidate);

		// 예전 version으로 여행을 고치면 409, 여행지를 직접 고쳐도 투표에서 온 기록은 남는다
		mockMvc.perform(patch("/api/v1/trips/{tripId}", regionTripId).with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":1,\"title\":\"x\"}"))
				.andExpect(status().isConflict());
		mockMvc.perform(patch("/api/v1/trips/{tripId}", regionTripId).with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"expectedVersion\":2,\"destinationRegionIds\":[\"%s\",\"%s\"]}".formatted(busan, seoul)))
				.andExpect(status().isOk());
		assertThat(jdbcTemplate.queryForObject(
				"select source_candidate_id::text from trip_destinations where trip_id = ? and region_id = ?",
				String.class, regionTripId, busan)).isEqualTo(busanCandidate);
	}

	@Test
	void closesOnceUnderConcurrentReadsAndAutoClose() throws Exception {
		JsonNode poll = data(createPoll(ownerId, placePoll(insertPlace(), insertPlace())));
		UUID pollId = id(poll);
		ballot(ownerId, pollId, "[\"%s\"]".formatted(candidateId(poll, 0)), 1).andExpect(status().isOk());
		expire(pollId);

		ExecutorService executor = Executors.newFixedThreadPool(4);
		CountDownLatch start = new CountDownLatch(1);
		List<Future<Integer>> results = new ArrayList<>();
		try {
			for (int i = 0; i < 4; i++) {
				boolean auto = i % 2 == 0;
				Callable<Integer> task = () -> {
					start.await();
					if (auto) {
						pollAutoCloser.closeDuePolls();
						return 200;
					}
					return getPoll(friendId, pollId).andReturn().getResponse().getStatus();
				};
				results.add(executor.submit(task));
			}
			start.countDown();
			for (Future<Integer> result : results) {
				assertThat(result.get()).isEqualTo(200);
			}
		} finally {
			executor.shutdownNow();
		}

		assertThat(count("select version from polls where id = ?", pollId)).isEqualTo(2);
		assertThat(count("select count(*) from poll_results r join poll_candidates c on c.id = r.candidate_id"
				+ " where c.poll_id = ?", pollId)).isEqualTo(1);
	}

	@Test
	void documentsPollApis() throws Exception {
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/polls'].get.tags[0]").value("투표"))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/polls'].post.responses['201']").exists())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/polls/{pollId}'].get.responses['404'].description")
						.value(containsString("POLL_NOT_FOUND")))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/polls/{pollId}/ballot'].put.responses['409'].description")
						.value(containsString("POLL_CLOSED")))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/polls/{pollId}/candidates'].post.responses['201']")
						.exists());
	}

	private ResultActions createPoll(UUID userId, String body) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/polls", tripId).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content(body));
	}

	private ResultActions getPoll(UUID userId, UUID pollId) throws Exception {
		return mockMvc.perform(get("/api/v1/trips/{tripId}/polls/{pollId}", tripId, pollId).with(authUser(userId)));
	}

	private ResultActions ballot(UUID userId, UUID pollId, String candidateIds, long expectedVersion) throws Exception {
		return mockMvc.perform(put("/api/v1/trips/{tripId}/polls/{pollId}/ballot", tripId, pollId).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"candidateIds\":%s,\"expectedVersion\":%d}".formatted(candidateIds, expectedVersion)));
	}

	private void vote(UUID userId, UUID otherTripId, UUID pollId, String candidateIds) throws Exception {
		mockMvc.perform(put("/api/v1/trips/{tripId}/polls/{pollId}/ballot", otherTripId, pollId).with(authUser(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"candidateIds\":%s,\"expectedVersion\":1}".formatted(candidateIds)))
				.andExpect(status().isOk());
	}

	private ResultActions addCandidate(UUID userId, UUID pollId, String candidate, long expectedVersion)
			throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/polls/{pollId}/candidates", tripId, pollId)
				.with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"candidate\":%s,\"expectedVersion\":%d}".formatted(candidate, expectedVersion)));
	}

	private String placePoll(UUID... placeIds) {
		List<String> candidates = new ArrayList<>();
		for (UUID placeId : placeIds) {
			candidates.add("{\"placeId\":\"%s\"}".formatted(placeId));
		}
		return "{\"type\":\"PLACE\",\"title\":\"어디 갈까\",\"candidates\":[%s],\"closesAt\":\"%s\"}"
				.formatted(String.join(",", candidates), Instant.now().plus(1, ChronoUnit.DAYS));
	}

	// 마감 시각을 지난 시각으로 옮긴다. 상태는 OPEN 그대로라 다음 조회·쓰기·주기 마감이 마감한다
	private void expire(UUID pollId) {
		jdbcTemplate.update("update polls set closes_at = now() - interval '1 minute' where id = ?", pollId);
	}

	private UUID createTrip(String body) throws Exception {
		return id(data(mockMvc.perform(post("/api/v1/trips").with(authUser(ownerId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isCreated())));
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

	private void expectTripNotFound(ResultActions result) throws Exception {
		expectCode(result, 404, "TRIP_NOT_FOUND");
	}

	private String candidateId(JsonNode poll, int index) {
		return poll.get("candidates").get(index).get("id").asString();
	}

	private UUID id(JsonNode node) {
		return UUID.fromString(node.get("id").asString());
	}

	private JsonNode data(ResultActions result) throws Exception {
		return body(result).get("data");
	}

	private JsonNode body(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString());
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

	private UUID insertMember(UUID memberTripId, UUID userId, long joinOrder, String status) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at, left_at)
				values (?, ?, ?, ?, ?, now(), case when ? = 'ACTIVE' then null else now() end)""",
				id, memberTripId, userId, status, joinOrder, status);
		return id;
	}

	private UUID insertRegion() {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("insert into regions (id, code, name) values (?, ?, ?)", id, "TEST-" + id, "지역");
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
