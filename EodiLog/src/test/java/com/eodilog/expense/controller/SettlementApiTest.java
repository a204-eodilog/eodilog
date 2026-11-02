package com.eodilog.expense.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
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

// 실제 커밋된 경비·정산 행을 확인하므로 테스트 트랜잭션을 쓰지 않는다. 테스트마다 새 사용자·여행으로 자료를 구분한다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SettlementApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	private UUID ownerId;
	private UUID friendId;
	private UUID thirdId;
	private UUID tripId;
	private UUID ownerMemberId;
	private UUID friendMemberId;
	private UUID thirdMemberId;

	@BeforeEach
	void setUp() throws Exception {
		ownerId = insertUser("방장");
		friendId = insertUser("동행");
		thirdId = insertUser("셋째");
		JsonNode trip = data(mockMvc.perform(post("/api/v1/trips").with(authUser(ownerId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"title\":\"제주\"}"))
				.andExpect(status().isCreated()));
		tripId = UUID.fromString(trip.get("id").asString());
		ownerMemberId = UUID.fromString(trip.get("ownerMemberId").asString());
		friendMemberId = insertMember(friendId, 2);
		thirdMemberId = insertMember(thirdId, 3);
	}

	@Test
	void calculatesWithAgreedRoundingAndBecomesCurrent() throws Exception {
		// A 답변 §3 예시: 10,001원 경비 3건을 세 사람이 균등 분담, 모두 방장이 결제
		for (int i = 0; i < 3; i++) {
			addExpense(ownerId, 10001, ownerMemberId);
		}

		JsonNode settlement = data(calculate(ownerId, UUID.randomUUID().toString(), 3)
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.currency").value("KRW"))
				.andExpect(jsonPath("$.data.expenseVersion").value(3))
				.andExpect(jsonPath("$.data.version").value(1))
				.andExpect(jsonPath("$.data.stale").value(false))
				.andExpect(jsonPath("$.data.totalAmountMinor").value(30003))
				.andExpect(jsonPath("$.data.roundingAdjustmentMinor").value(17))
				.andExpect(jsonPath("$.data.roundingPolicy").value("TRIP_TOTAL_CEIL_10_TO_TOP_CREDITOR"))
				.andExpect(jsonPath("$.data.includedExpenses", hasSize(3)))
				.andExpect(jsonPath("$.data.includedExpenses[0].shares", hasSize(3)))
				.andExpect(jsonPath("$.data.members[*].memberId").value(contains(
						ownerMemberId.toString(), friendMemberId.toString(), thirdMemberId.toString())))
				.andExpect(jsonPath("$.data.members[*].baseOwedMinor").value(contains(10002, 10002, 9999)))
				.andExpect(jsonPath("$.data.members[*].owedMinor").value(contains(10010, 10010, 10000)))
				.andExpect(jsonPath("$.data.members[*].balanceMinor").value(contains(20010, -10010, -10000)))
				.andExpect(jsonPath("$.data.transfers", hasSize(2)))
				.andExpect(jsonPath("$.data.transfers[0].fromMemberId").value(friendMemberId.toString()))
				.andExpect(jsonPath("$.data.transfers[0].toMemberId").value(ownerMemberId.toString()))
				.andExpect(jsonPath("$.data.transfers[0].amountMinor").value(10010))
				.andExpect(jsonPath("$.data.transfers[1].amountMinor").value(10000)));

		assertThat(UUID.fromString(settlement.get("id").asString()).version()).isEqualTo(7);
		settlementState(friendId)
				.andExpect(jsonPath("$.data.current.id").value(settlement.get("id").asString()))
				.andExpect(jsonPath("$.data.currentExpenseVersion").value(3))
				.andExpect(jsonPath("$.data.recalculationRequired").value(false));
		assertThat(count("select count(*) from trips where id = ? and current_settlement_id = ?",
				tripId, UUID.fromString(settlement.get("id").asString()))).isEqualTo(1);
	}

	@Test
	void keepsPastCalculationWhenExpensesChange() throws Exception {
		UUID expenseId = addExpense(ownerId, 9000, ownerMemberId);
		String firstId = data(calculate(ownerId, UUID.randomUUID().toString(), 1)).get("id").asString();

		mockMvc.perform(patch("/api/v1/trips/{tripId}/expenses/{expenseId}", tripId, expenseId).with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"expectedVersion\":1,\"amountMinor\":12000}"))
				.andExpect(status().isOk());
		settlementState(ownerId)
				.andExpect(jsonPath("$.data.current.id").value(firstId))
				.andExpect(jsonPath("$.data.current.stale").value(true))
				.andExpect(jsonPath("$.data.currentExpenseVersion").value(2))
				.andExpect(jsonPath("$.data.recalculationRequired").value(true));

		String secondId = data(calculate(ownerId, UUID.randomUUID().toString(), 2)
				.andExpect(jsonPath("$.data.totalAmountMinor").value(12000))).get("id").asString();

		// 이전 계산은 지우지 않고, 계산 당시 경비 값을 그대로 보여 준다
		mockMvc.perform(get("/api/v1/trips/{tripId}/settlements/{id}", tripId, firstId).with(authUser(friendId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.stale").value(true))
				.andExpect(jsonPath("$.data.totalAmountMinor").value(9000))
				.andExpect(jsonPath("$.data.includedExpenses[0].amountMinor").value(9000))
				.andExpect(jsonPath("$.data.includedExpenses[0].expenseVersion").value(1));
		mockMvc.perform(get("/api/v1/trips/{tripId}/settlements", tripId).with(authUser(ownerId)).param("limit", "1"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data", hasSize(1)))
				.andExpect(jsonPath("$.data[0].id").value(secondId))
				.andExpect(jsonPath("$.data[0].stale").value(false))
				.andExpect(jsonPath("$.page.hasNext").value(true));
		String cursor = body(mockMvc.perform(get("/api/v1/trips/{tripId}/settlements", tripId).with(authUser(ownerId))
				.param("limit", "1"))).get("page").get("nextCursor").asString();
		mockMvc.perform(get("/api/v1/trips/{tripId}/settlements", tripId).with(authUser(ownerId))
						.param("limit", "1").param("cursor", cursor))
				.andExpect(jsonPath("$.data[0].id").value(firstId))
				.andExpect(jsonPath("$.page.hasNext").value(false));
		assertThat(count("select count(*) from settlements where trip_id = ?", tripId)).isEqualTo(2);
	}

	@Test
	void rejectsOutdatedExpenseVersionWithoutSaving() throws Exception {
		addExpense(ownerId, 1000, ownerMemberId);

		calculate(ownerId, UUID.randomUUID().toString(), 0)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
		assertThat(count("select count(*) from settlements where trip_id = ?", tripId)).isZero();
		settlementState(ownerId).andExpect(jsonPath("$.data.current").isEmpty());
	}

	@Test
	void replaysSameKeyOnlyForActiveMembers() throws Exception {
		addExpense(ownerId, 3000, ownerMemberId);
		String key = UUID.randomUUID().toString();
		JsonNode first = data(calculate(friendId, key, 1).andExpect(status().isCreated()));

		JsonNode second = data(calculate(friendId, key, 1).andExpect(status().isCreated()));
		assertThat(second.get("id")).isEqualTo(first.get("id"));
		assertThat(count("select count(*) from settlements where trip_id = ?", tripId)).isEqualTo(1);
		calculate(friendId, key, 2)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("IDEMPOTENCY_KEY_REUSED"));

		// 계산한 뒤 나가면 같은 키로 다시 보내도 결과를 받을 수 없다
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where id = ?", friendMemberId);
		calculate(friendId, key, 1)
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
	}

	@Test
	void retriesSameKeyAfterVersionConflict() throws Exception {
		// 409로 끝난 요청은 멱등 기록도 함께 롤백되므로, 같은 키로 올바른 버전을 다시 보내면 계산된다
		addExpense(ownerId, 1000, ownerMemberId);
		String key = UUID.randomUUID().toString();

		calculate(ownerId, key, 0).andExpect(status().isConflict());
		calculate(ownerId, key, 1)
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.expenseVersion").value(1));
	}

	@Test
	void keepsMemberOrderOfPastCalculation() throws Exception {
		addExpense(ownerId, 3000, friendMemberId);
		String settlementId = data(calculate(ownerId, UUID.randomUUID().toString(), 1)).get("id").asString();
		// 동행이 나갔다가 다시 들어와 참여 순이 맨 뒤로 바뀐 상황
		jdbcTemplate.update("update trip_members set join_order = 10 where id = ?", friendMemberId);

		mockMvc.perform(get("/api/v1/trips/{tripId}/settlements/{id}", tripId, settlementId).with(authUser(ownerId)))
				.andExpect(jsonPath("$.data.members[*].memberId").value(contains(
						ownerMemberId.toString(), friendMemberId.toString(), thirdMemberId.toString())));
		calculate(ownerId, UUID.randomUUID().toString(), 1)
				.andExpect(jsonPath("$.data.members[*].memberId").value(contains(
						ownerMemberId.toString(), thirdMemberId.toString(), friendMemberId.toString())));
	}

	@Test
	void validatesInputBeforeMembership() throws Exception {
		UUID strangerId = insertUser("모르는 사람");
		mockMvc.perform(post("/api/v1/trips/{tripId}/settlements", tripId).with(authUser(strangerId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("expectedExpenseVersion"));
		mockMvc.perform(post("/api/v1/trips/{tripId}/settlements", tripId).with(authUser(strangerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"expectedExpenseVersion\":0}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value(IdempotencyService.HEADER_NAME));
		calculate(strangerId, UUID.randomUUID().toString(), 0)
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
		mockMvc.perform(get("/api/v1/trips/{tripId}/settlements", tripId).with(authUser(strangerId)))
				.andExpect(status().isNotFound());
		for (String limit : new String[] {"0", "101"}) {
			mockMvc.perform(get("/api/v1/trips/{tripId}/settlements", tripId).with(authUser(ownerId)).param("limit", limit))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.error.fields[0].field").value("limit"));
		}
	}

	@Test
	void calculatesEmptySettlementWithoutExpenses() throws Exception {
		calculate(ownerId, UUID.randomUUID().toString(), 0)
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.totalAmountMinor").value(0))
				.andExpect(jsonPath("$.data.roundingAdjustmentMinor").value(0))
				.andExpect(jsonPath("$.data.includedExpenses", hasSize(0)))
				.andExpect(jsonPath("$.data.members", hasSize(0)))
				.andExpect(jsonPath("$.data.transfers", hasSize(0)));
	}

	@Test
	void includesPastExpensesOfLeftMembers() throws Exception {
		// 셋째가 결제한 뒤 나가도 과거 결제·분담은 정산에 포함된다
		addExpense(thirdId, 6001, thirdMemberId);
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where id = ?", thirdMemberId);

		calculate(ownerId, UUID.randomUUID().toString(), 1)
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.members", hasSize(3)))
				.andExpect(jsonPath("$.data.members[2].memberId").value(thirdMemberId.toString()))
				.andExpect(jsonPath("$.data.members[2].paidMinor").value(6001))
				.andExpect(jsonPath("$.data.transfers", hasSize(2)))
				.andExpect(jsonPath("$.data.transfers[*].toMemberId").value(
						everyItem(is(thirdMemberId.toString()))));
	}

	@Test
	void hidesSettlementOfOtherTrip() throws Exception {
		String settlementId = data(calculate(ownerId, UUID.randomUUID().toString(), 0)).get("id").asString();
		UUID otherTripId = UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(ownerId))
				.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"title\":\"부산\"}"))).get("id").asString());

		mockMvc.perform(get("/api/v1/trips/{tripId}/settlements/{id}", otherTripId, settlementId).with(authUser(ownerId)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("SETTLEMENT_NOT_FOUND"));
		mockMvc.perform(get("/api/v1/trips/{tripId}/settlements/{id}", tripId, UUID.randomUUID()).with(authUser(ownerId)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("SETTLEMENT_NOT_FOUND"));
	}

	@Test
	void documentsSettlementApis() throws Exception {
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/settlements'].post.responses['201']").exists())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/settlements'].post.responses['409'].description")
						.value(containsString("VERSION_CONFLICT")))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/settlements'].get.tags[0]").value("경비"))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/settlements/{settlementId}'].get.responses['404'].description")
						.value(containsString("SETTLEMENT_NOT_FOUND")))
				.andExpect(jsonPath("$.components.schemas.SettlementResponse.properties.transfers").exists());
	}

	private ResultActions calculate(UUID userId, String key, long expectedExpenseVersion) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/settlements", tripId).with(authUser(userId))
				.header(IdempotencyService.HEADER_NAME, key)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"expectedExpenseVersion\":%d}".formatted(expectedExpenseVersion)));
	}

	// 세 사람 균등 분담 경비를 등록한다. 결제자는 payerMemberId
	private UUID addExpense(UUID userId, long amount, UUID payerMemberId) throws Exception {
		return UUID.fromString(data(mockMvc.perform(post("/api/v1/trips/{tripId}/expenses", tripId).with(authUser(userId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"title":"저녁","amountMinor":%d,"currency":"KRW","payerMemberId":"%s",
								 "participantMemberIds":["%s","%s","%s"],"spentAt":"2026-11-01T11:30:00Z"}
								""".formatted(amount, payerMemberId, ownerMemberId, friendMemberId, thirdMemberId)))
				.andExpect(status().isCreated())).get("id").asString());
	}

	private ResultActions settlementState(UUID userId) throws Exception {
		return mockMvc.perform(get("/api/v1/trips/{tripId}/settlement", tripId).with(authUser(userId)));
	}

	private JsonNode body(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString());
	}

	private JsonNode data(ResultActions result) throws Exception {
		return body(result).get("data");
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

	private UUID insertMember(UUID userId, long joinOrder) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at)
				values (?, ?, ?, 'ACTIVE', ?, now())""", id, tripId, userId, joinOrder);
		return id;
	}

}
