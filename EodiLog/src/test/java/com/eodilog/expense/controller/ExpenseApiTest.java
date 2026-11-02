package com.eodilog.expense.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
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
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 실제 커밋을 확인해야 하므로 테스트 트랜잭션을 쓰지 않는다. 테스트마다 새 여행·사용자로 자료를 구분한다
// 방장(참여 순 1)·동행(2)·나간 동행(3)이 있는 여행에서 확인한다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ExpenseApiTest {

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
	private UUID leftMemberId;

	@BeforeEach
	void setUp() throws Exception {
		ownerId = insertUser("방장");
		friendId = insertUser("동행");
		JsonNode trip = data(mockMvc.perform(post("/api/v1/trips").with(authUser(ownerId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"title\":\"제주\"}"))
				.andExpect(status().isCreated()));
		tripId = UUID.fromString(trip.get("id").asString());
		ownerMemberId = UUID.fromString(trip.get("ownerMemberId").asString());
		friendMemberId = insertMember(tripId, friendId, 2, "ACTIVE");
		leftMemberId = insertMember(tripId, insertUser("나간 동행"), 3, "LEFT");
	}

	@Test
	void createsExpenseWithEqualSharesInJoinOrder() throws Exception {
		JsonNode expense = data(createExpense(ownerId, UUID.randomUUID().toString(), """
				{"title":"  흑돼지 저녁  ","memo":"  2차 별도  ","amountMinor":10001,"currency":"KRW",
				 "payerMemberId":"%s","participantMemberIds":["%s","%s"],"spentAt":"2026-11-01T11:30:00.123456789Z"}
				""".formatted(friendMemberId, friendMemberId, ownerMemberId))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.title").value("흑돼지 저녁"))
				.andExpect(jsonPath("$.data.memo").value("2차 별도"))
				.andExpect(jsonPath("$.data.currency").value("KRW"))
				.andExpect(jsonPath("$.data.version").value(1))
				.andExpect(jsonPath("$.data.spentAt").value("2026-11-01T11:30:00.123456Z"))
				.andExpect(jsonPath("$.data.registeredByMemberId").value(ownerMemberId.toString()))
				.andExpect(jsonPath("$.data.payerMemberId").value(friendMemberId.toString()))
				.andExpect(jsonPath("$.data.participantMemberIds[0]").value(ownerMemberId.toString()))
				.andExpect(jsonPath("$.data.participantMemberIds[1]").value(friendMemberId.toString()))
				.andExpect(jsonPath("$.data.shares[0].amountMinor").value(5001))
				.andExpect(jsonPath("$.data.shares[1].amountMinor").value(5000)));

		assertThat(UUID.fromString(expense.get("id").asString()).version()).isEqualTo(7);
		assertThat(expenseVersion()).isEqualTo(1);
		settlementState(ownerId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.current").isEmpty())
				.andExpect(jsonPath("$.data.currentExpenseVersion").value(1))
				.andExpect(jsonPath("$.data.recalculationRequired").value(false));
	}

	@Test
	void replayChecksCurrentMembership() throws Exception {
		// 등록한 뒤 나가거나 내보내지면, 같은 키·본문으로 다시 보내도 저장된 경비를 받을 수 없다
		String leftKey = UUID.randomUUID().toString();
		String leftBody = expense(1000, friendMemberId, List.of(friendMemberId));
		createExpense(friendId, leftKey, leftBody).andExpect(status().isCreated());
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where id = ?", friendMemberId);
		expectTripNotFound(createExpense(friendId, leftKey, leftBody));

		UUID removedId = insertUser("내보낸 동행");
		UUID removedMemberId = insertMember(tripId, removedId, 4, "ACTIVE");
		String removedKey = UUID.randomUUID().toString();
		String removedBody = expense(2000, removedMemberId, List.of(removedMemberId));
		createExpense(removedId, removedKey, removedBody).andExpect(status().isCreated());
		jdbcTemplate.update("update trip_members set status = 'REMOVED', left_at = now() where id = ?", removedMemberId);
		expectTripNotFound(createExpense(removedId, removedKey, removedBody));

		String ownerKey = UUID.randomUUID().toString();
		createExpense(ownerId, ownerKey, simpleExpense(3000)).andExpect(status().isCreated());
		jdbcTemplate.update("update trips set deleted_at = now() where id = ?", tripId);
		expectTripNotFound(createExpense(ownerId, ownerKey, simpleExpense(3000)));

		assertThat(count("select count(*) from expenses where trip_id = ?", tripId)).isEqualTo(3);
	}

	@Test
	void checksKeyFormatBeforeMembership() throws Exception {
		// 입력 오류가 권한보다 먼저다(명세 §2). 비참여자도 키가 없으면 400
		mockMvc.perform(post("/api/v1/trips/{tripId}/expenses", tripId).with(authUser(insertUser("모르는 사람")))
						.contentType(MediaType.APPLICATION_JSON)
						.content(simpleExpense(1000)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value(IdempotencyService.HEADER_NAME));
	}

	@Test
	void handlesConcurrentRetriesWithoutDeadlock() throws Exception {
		// 같은 키 재시도와 다른 키 등록이 동시에 와도 여행 잠금 → 멱등 기록 순서라 교착 없이 키마다 경비 하나
		List<String> keys = List.of("retry-a", "retry-a", "retry-b", "retry-b");
		CountDownLatch ready = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(keys.size());
		List<Future<MockHttpServletResponse>> futures = new ArrayList<>();
		try {
			for (String key : keys) {
				futures.add(executor.submit(() -> {
					ready.await();
					return createExpense(ownerId, key + "-" + tripId, simpleExpense(1000)).andReturn().getResponse();
				}));
			}
			ready.countDown();
			for (Future<MockHttpServletResponse> future : futures) {
				assertThat(future.get().getStatus()).isEqualTo(201);
			}
		} finally {
			executor.shutdownNow();
		}
		assertThat(count("select count(*) from expenses where trip_id = ?", tripId)).isEqualTo(2);
		assertThat(expenseVersion()).isEqualTo(2);
	}

	@Test
	void replaysSameIdempotencyKey() throws Exception {
		String key = UUID.randomUUID().toString();
		String body = simpleExpense(30000);

		JsonNode first = data(createExpense(ownerId, key, body).andExpect(status().isCreated()));
		JsonNode second = data(createExpense(ownerId, key, body).andExpect(status().isCreated()));

		assertThat(second).isEqualTo(first);
		assertThat(count("select count(*) from expenses where trip_id = ?", tripId)).isEqualTo(1);
		assertThat(expenseVersion()).isEqualTo(1);
		createExpense(ownerId, key, simpleExpense(40000))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("IDEMPOTENCY_KEY_REUSED"));
	}

	@Test
	void reportsAllInvalidFields() throws Exception {
		createExpense(ownerId, UUID.randomUUID().toString(), """
				{"title":" ","amountMinor":0,"participantMemberIds":["%s","%s"]}""".formatted(ownerMemberId, ownerMemberId))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields[*].field").value(containsInAnyOrder(
						"title", "amountMinor", "currency", "payerMemberId", "participantMemberIds", "spentAt")));
		createExpense(ownerId, UUID.randomUUID().toString(), simpleExpense(1000).replace("\"currency\"", "\"registeredByMemberId\":\"%s\",\"currency\"".formatted(friendMemberId)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("registeredByMemberId"));
		assertThat(expenseVersion()).isZero();
	}

	@Test
	void checksTitleAndAmountBoundariesAndClearsBlankMemo() throws Exception {
		// E-4: 이름 200자, 원금 JSON 안전 정수(2^53-1)까지 받는다
		createExpense(ownerId, UUID.randomUUID().toString(), simpleExpense(1000).replace("저녁", "가".repeat(201)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("title"));
		createExpense(ownerId, UUID.randomUUID().toString(), simpleExpense(9_007_199_254_740_992L))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("amountMinor"));
		assertThat(expenseVersion()).isZero();

		createExpense(ownerId, UUID.randomUUID().toString(), simpleExpense(9_007_199_254_740_991L)
				.replace("저녁", "가".repeat(200)).replace("\"currency\"", "\"memo\":\"   \",\"currency\""))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.amountMinor").value(9_007_199_254_740_991L))
				.andExpect(jsonPath("$.data.memo").isEmpty());
	}

	@Test
	void requiresIdempotencyKey() throws Exception {
		// E-12: 키 없이 보낸 등록은 경비를 만들지 않는다
		mockMvc.perform(post("/api/v1/trips/{tripId}/expenses", tripId).with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(simpleExpense(1000)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value(IdempotencyService.HEADER_NAME));
		assertThat(count("select count(*) from expenses where trip_id = ?", tripId)).isZero();
	}

	@Test
	void rejectsForeignCurrencyAndInvalidParticipants() throws Exception {
		createExpense(ownerId, UUID.randomUUID().toString(), simpleExpense(1000).replace("\"KRW\"", "\"USD\""))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.error.code").value("CURRENCY_MISMATCH"));
		createExpense(ownerId, UUID.randomUUID().toString(), expense(1000, UUID.randomUUID(), List.of(ownerMemberId)))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.error.code").value("INVALID_PARTICIPANTS"))
				.andExpect(jsonPath("$.error.fields[0].field").value("payerMemberId"));
		createExpense(ownerId, UUID.randomUUID().toString(), expense(1000, ownerMemberId, List.of(ownerMemberId, leftMemberId)))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.error.code").value("INVALID_PARTICIPANTS"))
				.andExpect(jsonPath("$.error.fields[0].field").value("participantMemberIds"));
		assertThat(expenseVersion()).isZero();
	}

	@Test
	void hidesExpensesFromNonMembers() throws Exception {
		UUID strangerId = insertUser("모르는 사람");

		createExpense(strangerId, UUID.randomUUID().toString(), simpleExpense(1000))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
		listExpenses(strangerId, "").andExpect(status().isNotFound());
		settlementState(strangerId).andExpect(status().isNotFound());
	}

	@Test
	void listsNewestFirstWithCursorAndKeepsLeftParticipants() throws Exception {
		UUID first = id(createExpense(ownerId, UUID.randomUUID().toString(),
				expense(1000, ownerMemberId, List.of(ownerMemberId, friendMemberId))));
		UUID second = id(createExpense(friendId, UUID.randomUUID().toString(), simpleExpense(2000)));
		UUID third = id(createExpense(ownerId, UUID.randomUUID().toString(), simpleExpense(3000)));
		deleteExpense(ownerId, third, 1).andExpect(status().isNoContent());
		// 등록 뒤 동행이 나가도 과거 분담자로 남는다
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where id = ?", friendMemberId);

		JsonNode page1 = body(listExpenses(ownerId, "limit=1").andExpect(jsonPath("$.page.hasNext").value(true)));
		JsonNode page2 = body(listExpenses(ownerId, "limit=1&cursor=" + page1.get("page").get("nextCursor").asString())
				.andExpect(jsonPath("$.page.hasNext").value(false)));

		assertThat(List.of(id(page1.get("data").get(0)), id(page2.get("data").get(0)))).containsExactly(second, first);
		assertThat(page2.get("data").get(0).get("participantMemberIds").get(1).asString())
				.isEqualTo(friendMemberId.toString());
		listExpenses(ownerId, "cursor=broken").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("cursor"));
	}

	@Test
	void letsRegistrantUpdateAndResplit() throws Exception {
		UUID expenseId = id(createExpense(ownerId, UUID.randomUUID().toString(),
				expense(10000, ownerMemberId, List.of(ownerMemberId, friendMemberId))));

		updateExpense(ownerId, expenseId, """
				{"expectedVersion":1,"amountMinor":10001,"participantMemberIds":["%s"],"memo":null,"payerMemberId":"%s"}
				""".formatted(friendMemberId, friendMemberId))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(2))
				.andExpect(jsonPath("$.data.amountMinor").value(10001))
				.andExpect(jsonPath("$.data.payerMemberId").value(friendMemberId.toString()))
				.andExpect(jsonPath("$.data.memo").isEmpty())
				.andExpect(jsonPath("$.data.shares", hasSize(1)))
				.andExpect(jsonPath("$.data.shares[0].amountMinor").value(10001))
				.andExpect(jsonPath("$.data.title").value("저녁"));
		assertThat(expenseVersion()).isEqualTo(2);
		assertThat(count("select coalesce(sum(amount_minor), 0) from expense_shares where expense_id = ?", expenseId))
				.isEqualTo(10001);
	}

	@Test
	void keepsVersionWhenNothingChanged() throws Exception {
		UUID expenseId = id(createExpense(ownerId, UUID.randomUUID().toString(),
				expense(1000, ownerMemberId, List.of(ownerMemberId, friendMemberId))));

		updateExpense(ownerId, expenseId, """
				{"expectedVersion":1,"title":" 저녁 ","participantMemberIds":["%s","%s"],"currency":"KRW"}
				""".formatted(friendMemberId, ownerMemberId))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(1));
		assertThat(expenseVersion()).isEqualTo(1);
	}

	@Test
	void keepsExistingLeftParticipantButRejectsNewOne() throws Exception {
		UUID expenseId = id(createExpense(ownerId, UUID.randomUUID().toString(),
				expense(3000, ownerMemberId, List.of(ownerMemberId, friendMemberId))));
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where id = ?", friendMemberId);

		updateExpense(ownerId, expenseId, "{\"expectedVersion\":1,\"amountMinor\":4000}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.shares[1].memberId").value(friendMemberId.toString()));
		updateExpense(ownerId, expenseId, """
				{"expectedVersion":2,"participantMemberIds":["%s","%s"]}""".formatted(ownerMemberId, leftMemberId))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.error.code").value("INVALID_PARTICIPANTS"));
	}

	@Test
	void onlyRegistrantMayChange() throws Exception {
		UUID expenseId = id(createExpense(friendId, UUID.randomUUID().toString(),
				expense(1000, ownerMemberId, List.of(ownerMemberId, friendMemberId))));

		// 방장이고 결제자여도 등록자가 아니면 403
		updateExpense(ownerId, expenseId, "{\"expectedVersion\":1,\"title\":\"x\"}")
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
		deleteExpense(ownerId, expenseId, 1).andExpect(status().isForbidden());

		// 등록자가 여행에서 나가면 더 이상 고칠 수 없다
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where id = ?", friendMemberId);
		updateExpense(friendId, expenseId, "{\"expectedVersion\":1,\"title\":\"x\"}")
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
	}

	@Test
	void rejectsStaleVersionAndUnknownExpense() throws Exception {
		UUID expenseId = id(createExpense(ownerId, UUID.randomUUID().toString(), simpleExpense(1000)));
		updateExpense(ownerId, expenseId, "{\"expectedVersion\":1,\"title\":\"먼저\"}").andExpect(status().isOk());

		updateExpense(ownerId, expenseId, "{\"expectedVersion\":1,\"title\":\"나중\"}")
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
		deleteExpense(ownerId, expenseId, 1).andExpect(status().isConflict());
		updateExpense(ownerId, UUID.randomUUID(), "{\"expectedVersion\":1,\"title\":\"x\"}")
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("EXPENSE_NOT_FOUND"));
		updateExpense(ownerId, expenseId, "{\"title\":\"x\"}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("expectedVersion"));
	}

	@Test
	void deletesLogicallyAndBumpsExpenseVersion() throws Exception {
		UUID expenseId = id(createExpense(ownerId, UUID.randomUUID().toString(), simpleExpense(1000)));

		mockMvc.perform(delete("/api/v1/trips/{tripId}/expenses/{expenseId}", tripId, expenseId).with(authUser(ownerId)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("expectedVersion"));
		deleteExpense(ownerId, expenseId, 1).andExpect(status().isNoContent());

		assertThat(expenseVersion()).isEqualTo(2);
		assertThat(count("select count(*) from expenses where id = ? and deleted_at is not null", expenseId)).isEqualTo(1);
		assertThat(count("select count(*) from expense_shares where expense_id = ?", expenseId)).isEqualTo(1);
		listExpenses(ownerId, "").andExpect(jsonPath("$.data", hasSize(0)));
		deleteExpense(ownerId, expenseId, 1)
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("EXPENSE_NOT_FOUND"));
		settlementState(ownerId).andExpect(jsonPath("$.data.currentExpenseVersion").value(2));
	}

	@Test
	void rejectsListLimitOutOfRange() throws Exception {
		// E-11: limit은 1~100
		listExpenses(ownerId, "limit=0")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("limit"));
		listExpenses(ownerId, "limit=101")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("limit"));
		listExpenses(ownerId, "limit=100").andExpect(status().isOk());
	}

	@Test
	void keepsTripVersionWhenExpensesChange() throws Exception {
		// E-6: 경비 변경은 expense_version만 올리고 여행 정보 version은 그대로라 여행 수정이 409가 되지 않는다
		UUID expenseId = id(createExpense(ownerId, UUID.randomUUID().toString(), simpleExpense(1000)));
		updateExpense(ownerId, expenseId, "{\"expectedVersion\":1,\"amountMinor\":2000}").andExpect(status().isOk());
		deleteExpense(ownerId, expenseId, 2).andExpect(status().isNoContent());

		assertThat(expenseVersion()).isEqualTo(3);
		assertThat(count("select version from trips where id = ?", tripId)).isEqualTo(1);
		mockMvc.perform(patch("/api/v1/trips/{tripId}", tripId).with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"expectedVersion\":1,\"title\":\"제주 3박\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(2))
				.andExpect(jsonPath("$.data.expenseVersion").value(3));
	}

	@Test
	void documentsExpenseApis() throws Exception {
		JsonNode docs = jsonMapper.readTree(mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/expenses'].post.tags[0]").value("경비"))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/expenses'].post.responses['422'].description")
						.value(containsString("CURRENCY_MISMATCH")))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/expenses/{expenseId}'].patch.responses['403']").exists())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/settlement'].get").exists())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/settlements'].post.responses['409'].description")
						.value(containsString("VERSION_CONFLICT")))
				.andReturn().getResponse().getContentAsString());

		assertThat(docs.get("components").get("schemas").get("UpdateExpenseRequest").get("properties").propertyNames())
				.containsExactlyInAnyOrder("expectedVersion", "title", "memo", "amountMinor", "currency",
						"payerMemberId", "participantMemberIds", "spentAt");
	}

	private void expectTripNotFound(ResultActions result) throws Exception {
		result.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
	}

	private String simpleExpense(long amount) {
		return expense(amount, ownerMemberId, List.of(ownerMemberId));
	}

	private String expense(long amount, UUID payerMemberId, List<UUID> participants) {
		List<String> quoted = new ArrayList<>();
		participants.forEach(id -> quoted.add("\"" + id + "\""));
		return """
				{"title":"저녁","amountMinor":%d,"currency":"KRW","payerMemberId":"%s","participantMemberIds":[%s],"spentAt":"2026-11-01T11:30:00Z"}
				""".formatted(amount, payerMemberId, String.join(",", quoted));
	}

	private ResultActions createExpense(UUID userId, String key, String body) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/expenses", tripId).with(authUser(userId))
				.header(IdempotencyService.HEADER_NAME, key)
				.contentType(MediaType.APPLICATION_JSON)
				.content(body));
	}

	private ResultActions updateExpense(UUID userId, UUID expenseId, String body) throws Exception {
		return mockMvc.perform(patch("/api/v1/trips/{tripId}/expenses/{expenseId}", tripId, expenseId)
				.with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content(body));
	}

	private ResultActions deleteExpense(UUID userId, UUID expenseId, long expectedVersion) throws Exception {
		return mockMvc.perform(delete("/api/v1/trips/{tripId}/expenses/{expenseId}", tripId, expenseId)
				.with(authUser(userId))
				.param("expectedVersion", String.valueOf(expectedVersion)));
	}

	private ResultActions listExpenses(UUID userId, String query) throws Exception {
		return mockMvc.perform(get("/api/v1/trips/" + tripId + "/expenses?" + query).with(authUser(userId)));
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

	private UUID id(ResultActions result) throws Exception {
		return id(data(result.andExpect(status().isCreated())));
	}

	private UUID id(JsonNode node) {
		return UUID.fromString(node.get("id").asString());
	}

	private long expenseVersion() {
		return jdbcTemplate.queryForObject("select expense_version from trips where id = ?", Long.class, tripId);
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

	private UUID insertMember(UUID tripId, UUID userId, long joinOrder, String status) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at, left_at)
				values (?, ?, ?, ?, ?, now(), case when ? = 'ACTIVE' then null else now() end)""",
				id, tripId, userId, status, joinOrder, status);
		return id;
	}

}
