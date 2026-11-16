package com.eodilog.poll.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.poll.service.PollAutoCloser;
import com.eodilog.poll.service.PollReminderSender;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
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

// 투표 알림 5종(POLL_OPENED·POLL_CANDIDATE_ADDED·POLL_FINALIZED·POLL_CLOSED_NO_VOTES·POLL_REMINDER)의 수신자·멱등을 확인한다
// 마감 알림은 시각 마감(행동자 없음)과 연 사람의 직접 종료(종료한 사람 제외) 두 경우를 본다
// 방장(참여 순 1)·동행(2)·동행2(3)가 ACTIVE이고 나간 멤버(4)가 있는 여행이다. 알림은 notifications ⋈ events를 SQL로 읽는다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class PollNotificationTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	@Autowired
	private PollAutoCloser pollAutoCloser;

	@Autowired
	private PollReminderSender pollReminderSender;

	private UUID ownerId;
	private UUID friendId;
	private UUID secondFriendId;
	private UUID leaverId;
	private UUID tripId;

	@BeforeEach
	void setUp() throws Exception {
		ownerId = insertUser("방장");
		friendId = insertUser("동행");
		secondFriendId = insertUser("동행2");
		leaverId = insertUser("나간 동행");
		tripId = createTrip();
		insertMember(friendId, 2, "ACTIVE");
		insertMember(secondFriendId, 3, "ACTIVE");
		insertMember(leaverId, 4, "LEFT");
	}

	@Test
	void notifiesOtherActiveMembersWhenPollOpens() throws Exception {
		UUID pollId = id(createPoll(friendId, placePoll("첫날 저녁", Instant.now().plus(1, ChronoUnit.DAYS))));

		assertThat(kinds(ownerId)).containsExactly("POLL_OPENED");
		assertThat(kinds(secondFriendId)).containsExactly("POLL_OPENED");
		// 연 사람·나간 멤버는 받지 않는다
		assertThat(kinds(friendId)).isEmpty();
		assertThat(kinds(leaverId)).isEmpty();

		var event = jdbcTemplate.queryForMap("""
				select actor_user_id, target_type, target_id, payload_json->>'message' as message, deduplication_key
				from events where trip_id = ? and type = 'POLL_OPENED'""", tripId);
		assertThat(event.get("actor_user_id")).isEqualTo(friendId);
		assertThat(event.get("target_type")).isEqualTo("POLL");
		assertThat(event.get("target_id")).isEqualTo(pollId);
		assertThat(event.get("message")).isEqualTo("새 투표 \"첫날 저녁\"이 열렸어요.");
		assertThat(event.get("deduplication_key")).isEqualTo("POLL_OPENED:" + pollId);

		// 알림 조회 API에 그대로 나온다
		mockMvc.perform(get("/api/v1/me/notifications").with(authUser(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[0].kind").value("POLL_OPENED"))
				.andExpect(jsonPath("$.data[0].message").value("새 투표 \"첫날 저녁\"이 열렸어요."));
	}

	@Test
	void notifiesOnlyVotersWhenCandidateIsAdded() throws Exception {
		JsonNode poll = createPoll(ownerId, placePoll("어디 갈까", Instant.now().plus(1, ChronoUnit.DAYS)));
		UUID pollId = id(poll);
		String candidate = poll.get("candidates").get(0).get("id").asString();
		ballot(ownerId, pollId, candidate, 1).andExpect(status().isOk());
		ballot(friendId, pollId, candidate, 1).andExpect(status().isOk());

		// 예전 version이면 409로 롤백되고 알림도 남지 않는다
		addCandidate(friendId, pollId, 2).andExpect(status().isConflict());
		assertThat(count("select count(*) from events where trip_id = ? and type = 'POLL_CANDIDATE_ADDED'", tripId))
				.isZero();

		addCandidate(friendId, pollId, 1).andExpect(status().isCreated());

		// 표를 낸 방장만 받는다. 추가한 동행(표를 냈어도)과 표를 내지 않은 동행2는 받지 않는다
		assertThat(kinds(ownerId)).containsExactly("POLL_CANDIDATE_ADDED");
		assertThat(kinds(friendId)).containsExactly("POLL_OPENED");
		assertThat(kinds(secondFriendId)).containsExactly("POLL_OPENED");
	}

	@Test
	void notifiesEveryActiveMemberOnceWhenPollIsFinalized() throws Exception {
		JsonNode poll = createPoll(ownerId, placePoll("둘째 날", Instant.now().plus(1, ChronoUnit.DAYS)));
		UUID pollId = id(poll);
		ballot(friendId, pollId, poll.get("candidates").get(0).get("id").asString(), 1).andExpect(status().isOk());
		expire(pollId);

		pollAutoCloser.closeDuePolls();
		pollAutoCloser.closeDuePolls();

		// 서버가 마감하므로 연 사람도 받는다. 두 번 돌려도 한 건이다
		assertThat(kinds(ownerId)).containsExactly("POLL_FINALIZED");
		assertThat(kinds(friendId)).containsExactly("POLL_OPENED", "POLL_FINALIZED");
		assertThat(kinds(leaverId)).isEmpty();
		var event = jdbcTemplate.queryForMap("""
				select actor_user_id, payload_json->>'message' as message, deduplication_key
				from events where trip_id = ? and type = 'POLL_FINALIZED'""", tripId);
		assertThat(event.get("actor_user_id")).isNull();
		assertThat(event.get("message")).isEqualTo("\"둘째 날\" 투표가 마감됐어요. 결과를 확인해 보세요.");
		assertThat(event.get("deduplication_key")).isEqualTo("POLL_CLOSED:" + pollId);
	}

	@Test
	void notifiesNoVotesCloseWhenNobodyVoted() throws Exception {
		UUID pollId = id(createPoll(ownerId, placePoll("셋째 날", Instant.now().plus(1, ChronoUnit.DAYS))));
		expire(pollId);

		// 조회가 지연 마감을 일으켜도 같은 알림이다
		mockMvc.perform(get("/api/v1/trips/{tripId}/polls/{pollId}", tripId, pollId).with(authUser(friendId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("CLOSED"));
		pollAutoCloser.closeDuePolls();

		assertThat(kinds(ownerId)).containsExactly("POLL_CLOSED_NO_VOTES");
		assertThat(kinds(friendId)).containsExactly("POLL_OPENED", "POLL_CLOSED_NO_VOTES");
		assertThat(jdbcTemplate.queryForObject(
				"select payload_json->>'message' from events where trip_id = ? and type = 'POLL_CLOSED_NO_VOTES'",
				String.class, tripId)).isEqualTo("\"셋째 날\" 투표가 아무도 참여하지 않아 마감됐어요.");
	}

	@Test
	void notifiesOthersWhenCreatorClosesPoll() throws Exception {
		JsonNode poll = createPoll(friendId, placePoll("넷째 날", Instant.now().plus(1, ChronoUnit.DAYS)));
		UUID pollId = id(poll);
		ballot(ownerId, pollId, poll.get("candidates").get(0).get("id").asString(), 1).andExpect(status().isOk());

		close(friendId, pollId, 1).andExpect(status().isOk());
		// 다시 종료해도 409로 롤백되고 알림은 한 건이다. 주기 마감도 다시 알리지 않는다
		close(friendId, pollId, 2).andExpect(status().isConflict());
		pollAutoCloser.closeDuePolls();

		// 종료한 사람은 받지 않고, 나머지 ACTIVE 동행은 시각 마감과 같은 알림을 받는다
		assertThat(kinds(ownerId)).containsExactly("POLL_OPENED", "POLL_FINALIZED");
		assertThat(kinds(secondFriendId)).containsExactly("POLL_OPENED", "POLL_FINALIZED");
		assertThat(kinds(friendId)).isEmpty();
		assertThat(kinds(leaverId)).isEmpty();
		var event = jdbcTemplate.queryForMap("""
				select actor_user_id, payload_json->>'message' as message, deduplication_key
				from events where trip_id = ? and type = 'POLL_FINALIZED'""", tripId);
		assertThat(event.get("actor_user_id")).isEqualTo(friendId);
		assertThat(event.get("message")).isEqualTo("\"넷째 날\" 투표가 마감됐어요. 결과를 확인해 보세요.");
		assertThat(event.get("deduplication_key")).isEqualTo("POLL_CLOSED:" + pollId);
	}

	@Test
	void notifiesNoVotesCloseWhenCreatorClosesEmptyPoll() throws Exception {
		UUID pollId = id(createPoll(ownerId, placePoll("다섯째 날", Instant.now().plus(1, ChronoUnit.DAYS))));

		close(ownerId, pollId, 1).andExpect(status().isOk());

		assertThat(kinds(ownerId)).isEmpty();
		assertThat(kinds(friendId)).containsExactly("POLL_OPENED", "POLL_CLOSED_NO_VOTES");
		assertThat(jdbcTemplate.queryForObject(
				"select actor_user_id from events where trip_id = ? and type = 'POLL_CLOSED_NO_VOTES'",
				UUID.class, tripId)).isEqualTo(ownerId);
	}

	@Test
	void remindsOnlyNonVotersOnceAnHourBeforeClosing() throws Exception {
		// 마감 50분 전 투표는 대상이고, 2시간 전 투표는 아직 아니다
		JsonNode soon = createPoll(ownerId, placePoll("곧 마감", Instant.now().plus(50, ChronoUnit.MINUTES)));
		UUID soonId = id(soon);
		UUID laterId = id(createPoll(ownerId, placePoll("나중 마감", Instant.now().plus(2, ChronoUnit.HOURS))));
		ballot(friendId, soonId, soon.get("candidates").get(0).get("id").asString(), 1).andExpect(status().isOk());

		pollReminderSender.sendDueReminders();
		pollReminderSender.sendDueReminders();

		// 표를 낸 동행은 받지 않고, 연 방장도 표를 내지 않았으므로 받는다
		assertThat(remindersFor(ownerId)).containsExactly(soonId);
		assertThat(remindersFor(secondFriendId)).containsExactly(soonId);
		assertThat(remindersFor(friendId)).isEmpty();
		assertThat(remindersFor(leaverId)).isEmpty();
		assertThat(jdbcTemplate.queryForObject(
				"select payload_json->>'message' from events where trip_id = ? and type = 'POLL_REMINDER'",
				String.class, tripId)).isEqualTo("\"곧 마감\" 투표가 1시간 뒤 마감돼요.");
		assertThat(count("select count(*) from polls where id = ? and reminder_sent_at is not null", soonId))
				.isEqualTo(1);
		assertThat(count("select count(*) from polls where id = ? and reminder_sent_at is null", laterId))
				.isEqualTo(1);
		// 알림 표식은 투표 version을 바꾸지 않는다
		assertThat(count("select version from polls where id = ?", soonId)).isEqualTo(1);
	}

	@Test
	void marksReminderWithoutEventWhenEveryoneVoted() throws Exception {
		JsonNode poll = createPoll(ownerId, placePoll("모두 투표", Instant.now().plus(30, ChronoUnit.MINUTES)));
		UUID pollId = id(poll);
		String candidate = poll.get("candidates").get(0).get("id").asString();
		for (UUID voter : List.of(ownerId, friendId, secondFriendId)) {
			ballot(voter, pollId, candidate, 1).andExpect(status().isOk());
		}

		pollReminderSender.sendDueReminders();

		assertThat(count("select count(*) from events where trip_id = ? and type = 'POLL_REMINDER'", tripId)).isZero();
		assertThat(count("select count(*) from polls where id = ? and reminder_sent_at is not null", pollId))
				.isEqualTo(1);
	}

	@Test
	void skipsRemindersForClosedPollsAndDeletedTrips() throws Exception {
		UUID closedId = id(createPoll(ownerId, placePoll("마감됨", Instant.now().plus(30, ChronoUnit.MINUTES))));
		expire(closedId);
		pollAutoCloser.closeDuePolls();
		UUID otherTripId = createTrip();
		UUID deletedTripPoll = id(mockMvc.perform(post("/api/v1/trips/{tripId}/polls", otherTripId)
						.with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(placePoll("삭제된 여행", Instant.now().plus(30, ChronoUnit.MINUTES))))
				.andExpect(status().isCreated()));
		jdbcTemplate.update("update trips set deleted_at = now() where id = ?", otherTripId);

		pollReminderSender.sendDueReminders();

		assertThat(count("select count(*) from events where type = 'POLL_REMINDER' and target_id in (?, ?)",
				closedId, deletedTripPoll)).isZero();
	}

	private List<String> kinds(UUID userId) {
		return jdbcTemplate.queryForList("""
				select e.type from notifications n join events e on e.id = n.event_id
				where n.recipient_user_id = ? and e.trip_id = ? order by e.created_at, e.id""",
				String.class, userId, tripId);
	}

	private List<UUID> remindersFor(UUID userId) {
		return jdbcTemplate.queryForList("""
				select e.target_id from notifications n join events e on e.id = n.event_id
				where n.recipient_user_id = ? and e.trip_id = ? and e.type = 'POLL_REMINDER'""",
				UUID.class, userId, tripId);
	}

	private JsonNode createPoll(UUID userId, String body) throws Exception {
		return data(mockMvc.perform(post("/api/v1/trips/{tripId}/polls", tripId).with(authUser(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isCreated()));
	}

	private ResultActions ballot(UUID userId, UUID pollId, String candidateId, long expectedVersion)
			throws Exception {
		return mockMvc.perform(put("/api/v1/trips/{tripId}/polls/{pollId}/ballot", tripId, pollId)
				.with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"candidateIds\":[\"%s\"],\"expectedVersion\":%d}".formatted(candidateId, expectedVersion)));
	}

	private ResultActions close(UUID userId, UUID pollId, long expectedVersion) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/polls/{pollId}/close", tripId, pollId)
				.with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"expectedVersion\":%d}".formatted(expectedVersion)));
	}

	private ResultActions addCandidate(UUID userId, UUID pollId, long expectedVersion) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/polls/{pollId}/candidates", tripId, pollId)
				.with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"candidate\":{\"placeId\":\"%s\"},\"expectedVersion\":%d}"
						.formatted(insertPlace(), expectedVersion)));
	}

	private String placePoll(String title, Instant closesAt) {
		return "{\"type\":\"PLACE\",\"title\":\"%s\",\"candidates\":[{\"placeId\":\"%s\"},{\"placeId\":\"%s\"}],\"closesAt\":\"%s\"}"
				.formatted(title, insertPlace(), insertPlace(), closesAt.truncatedTo(ChronoUnit.SECONDS));
	}

	private void expire(UUID pollId) {
		jdbcTemplate.update("update polls set closes_at = now() - interval '1 minute' where id = ?", pollId);
	}

	private UUID createTrip() throws Exception {
		return UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(ownerId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"title\":\"제주\"}"))
				.andExpect(status().isCreated())).get("id").asString());
	}

	private UUID id(JsonNode node) {
		return UUID.fromString(node.get("id").asString());
	}

	private UUID id(ResultActions result) throws Exception {
		return id(data(result));
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

	private void insertMember(UUID userId, long joinOrder, String status) {
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at, left_at)
				values (?, ?, ?, ?, ?, now(), case when ? = 'ACTIVE' then null else now() end)""",
				UUID.randomUUID(), tripId, userId, status, joinOrder, status);
	}

	private UUID insertPlace() {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into places (id, name, latitude, longitude, source, created_at, updated_at)
				values (?, '장소', 33.4996213, 126.5311884, 'MANUAL', now(), now())""", id);
		return id;
	}

}
