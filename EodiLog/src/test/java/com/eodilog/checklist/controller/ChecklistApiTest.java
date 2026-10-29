package com.eodilog.checklist.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
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

// 실제 커밋과 동시 수정을 확인해야 하므로 테스트 트랜잭션을 쓰지 않는다. 테스트마다 새 사용자·여행으로 자료를 구분한다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ChecklistApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	private UUID ownerId;
	private UUID tripId;

	@BeforeEach
	void setUp() throws Exception {
		ownerId = insertUser("방장");
		tripId = createTrip(ownerId);
	}

	@Test
	void addsManualItemsAndListsThemInAddedOrder() throws Exception {
		addItem(ownerId, tripId, "{\"label\":\"  보조배터리  \"}")
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.label").value("보조배터리"))
				.andExpect(jsonPath("$.data.checked").value(false))
				.andExpect(jsonPath("$.data.checkedByMemberId").isEmpty())
				.andExpect(jsonPath("$.data.checkedAt").isEmpty())
				.andExpect(jsonPath("$.data.source").value("MANUAL"))
				.andExpect(jsonPath("$.data.sourceJobId").isEmpty())
				.andExpect(jsonPath("$.data.reason").isEmpty())
				.andExpect(jsonPath("$.data.modifiedByUser").value(false))
				.andExpect(jsonPath("$.data.version").value(1));
		addItem(ownerId, tripId, "{\"label\":\"우산\"}").andExpect(status().isCreated());

		getChecklist(ownerId, tripId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.items", hasSize(2)))
				.andExpect(jsonPath("$.data.items[0].label").value("보조배터리"))
				.andExpect(jsonPath("$.data.items[1].label").value("우산"));
		assertThat(jdbcTemplate.queryForObject(
				"select created_by_member_id from checklist_items where trip_id = ? and label = '우산'", UUID.class, tripId))
				.isEqualTo(memberId(tripId, ownerId));
	}

	@Test
	void showsEmptyListForNewTrip() throws Exception {
		getChecklist(ownerId, tripId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.items", hasSize(0)));
	}

	@Test
	void recordsCheckingMemberOnServerAndClearsOnUncheck() throws Exception {
		UUID friendId = insertUser("동행");
		insertMember(tripId, friendId, 2, "ACTIVE");
		UUID itemId = id(addItem(ownerId, tripId, "{\"label\":\"우산\"}"));

		updateItem(friendId, tripId, itemId, "{\"expectedVersion\":1,\"checked\":true}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.checked").value(true))
				.andExpect(jsonPath("$.data.checkedByMemberId").value(memberId(tripId, friendId).toString()))
				.andExpect(jsonPath("$.data.checkedAt").isNotEmpty())
				.andExpect(jsonPath("$.data.modifiedByUser").value(false))
				.andExpect(jsonPath("$.data.version").value(2));

		updateItem(ownerId, tripId, itemId, "{\"expectedVersion\":2,\"checked\":false}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.checked").value(false))
				.andExpect(jsonPath("$.data.checkedByMemberId").isEmpty())
				.andExpect(jsonPath("$.data.checkedAt").isEmpty())
				.andExpect(jsonPath("$.data.version").value(3));
	}

	@Test
	void renamesItemAndKeepsOmittedFields() throws Exception {
		UUID itemId = id(addItem(ownerId, tripId, "{\"label\":\"우산\"}"));
		JsonNode checked = data(updateItem(ownerId, tripId, itemId, "{\"expectedVersion\":1,\"checked\":true}"));

		updateItem(ownerId, tripId, itemId, "{\"expectedVersion\":2,\"label\":\" 접이식 우산 \"}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.label").value("접이식 우산"))
				.andExpect(jsonPath("$.data.modifiedByUser").value(true))
				.andExpect(jsonPath("$.data.checked").value(true))
				.andExpect(jsonPath("$.data.checkedByMemberId").value(checked.get("checkedByMemberId").asString()))
				.andExpect(jsonPath("$.data.checkedAt").value(checked.get("checkedAt").asString()))
				.andExpect(jsonPath("$.data.version").value(3));
	}

	@Test
	void keepsVersionWhenNothingChanged() throws Exception {
		UUID itemId = id(addItem(ownerId, tripId, "{\"label\":\"우산\"}"));

		updateItem(ownerId, tripId, itemId, "{\"expectedVersion\":1,\"label\":\" 우산 \",\"checked\":false}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(1))
				.andExpect(jsonPath("$.data.modifiedByUser").value(false));
		updateItem(ownerId, tripId, itemId, "{\"expectedVersion\":1}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(1));
	}

	@Test
	void rejectsInvalidRequests() throws Exception {
		expectValidationError(addItem(ownerId, tripId, "{}"), "label");
		expectValidationError(addItem(ownerId, tripId, "{\"label\":\"   \"}"), "label");
		expectValidationError(addItem(ownerId, tripId, "{\"label\":\"%s\"}".formatted("가".repeat(256))), "label");
		expectValidationError(addItem(ownerId, tripId,
				"{\"label\":\"우산\",\"sourceJobId\":\"%s\",\"suggestionIndex\":0}".formatted(UUID.randomUUID())),
				"sourceJobId");
		expectValidationError(addItem(ownerId, tripId, "{\"label\":\"우산\",\"checked\":true}"), "checked");
		assertThat(count("select count(*) from checklist_items where trip_id = ?", tripId)).isZero();

		UUID itemId = id(addItem(ownerId, tripId, "{\"label\":\"우산\"}"));
		expectValidationError(updateItem(ownerId, tripId, itemId, "{\"checked\":true}"), "expectedVersion");
		expectValidationError(updateItem(ownerId, tripId, itemId, "{\"expectedVersion\":1,\"label\":null}"), "label");
		expectValidationError(updateItem(ownerId, tripId, itemId, "{\"expectedVersion\":1,\"checked\":null}"), "checked");
		expectValidationError(updateItem(ownerId, tripId, itemId,
				"{\"expectedVersion\":1,\"checkedByMemberId\":\"%s\"}".formatted(UUID.randomUUID())), "checkedByMemberId");
		assertThat(count("select version from checklist_items where id = ?", itemId)).isEqualTo(1);
	}

	@Test
	void rejectsStaleVersionWithoutOverwriting() throws Exception {
		UUID itemId = id(addItem(ownerId, tripId, "{\"label\":\"우산\"}"));
		updateItem(ownerId, tripId, itemId, "{\"expectedVersion\":1,\"label\":\"먼저 고친 이름\"}").andExpect(status().isOk());

		updateItem(ownerId, tripId, itemId, "{\"expectedVersion\":1,\"label\":\"늦게 고친 이름\"}")
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));

		getChecklist(ownerId, tripId)
				.andExpect(jsonPath("$.data.items[0].label").value("먼저 고친 이름"))
				.andExpect(jsonPath("$.data.items[0].version").value(2));
	}

	@Test
	void letsOnlyOneConcurrentEditWithSameVersionSucceed() throws Exception {
		UUID itemId = id(addItem(ownerId, tripId, "{\"label\":\"우산\"}"));
		List<String> labels = List.of("A안", "B안", "C안", "D안");
		CountDownLatch ready = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(labels.size());
		List<Future<MockHttpServletResponse>> futures = new ArrayList<>();
		try {
			for (String label : labels) {
				futures.add(executor.submit(() -> {
					ready.await();
					return updateItem(ownerId, tripId, itemId, "{\"expectedVersion\":1,\"label\":\"%s\"}".formatted(label))
							.andReturn().getResponse();
				}));
			}
			ready.countDown();

			List<String> winners = new ArrayList<>();
			for (Future<MockHttpServletResponse> future : futures) {
				MockHttpServletResponse response = future.get();
				assertThat(response.getStatus()).isIn(200, 409);
				if (response.getStatus() == 200) {
					winners.add(jsonMapper.readTree(response.getContentAsString()).get("data").get("label").asString());
				}
			}
			assertThat(winners).hasSize(1);
			getChecklist(ownerId, tripId)
					.andExpect(jsonPath("$.data.items[0].label").value(winners.getFirst()))
					.andExpect(jsonPath("$.data.items[0].version").value(2));
		} finally {
			executor.shutdownNow();
		}
	}

	@Test
	void softDeletesItemAndHidesIt() throws Exception {
		UUID itemId = id(addItem(ownerId, tripId, "{\"label\":\"우산\"}"));
		addItem(ownerId, tripId, "{\"label\":\"여권\"}");

		deleteItem(ownerId, tripId, itemId).andExpect(status().isNoContent());

		getChecklist(ownerId, tripId)
				.andExpect(jsonPath("$.data.items", hasSize(1)))
				.andExpect(jsonPath("$.data.items[0].label").value("여권"));
		assertThat(count("select count(*) from checklist_items where id = ? and deleted_at is not null", itemId))
				.isEqualTo(1);
		expectItemNotFound(deleteItem(ownerId, tripId, itemId));
		expectItemNotFound(updateItem(ownerId, tripId, itemId, "{\"expectedVersion\":1,\"checked\":true}"));
	}

	@Test
	void hidesChecklistFromNonMembersAndItemsOfOtherTrips() throws Exception {
		UUID itemId = id(addItem(ownerId, tripId, "{\"label\":\"우산\"}"));
		UUID leaverId = insertUser("나간 동행");
		UUID strangerId = insertUser("모르는 사람");
		insertMember(tripId, leaverId, 2, "LEFT");

		for (UUID outsiderId : List.of(leaverId, strangerId)) {
			expectTripNotFound(getChecklist(outsiderId, tripId));
			expectTripNotFound(addItem(outsiderId, tripId, "{\"label\":\"x\"}"));
			expectTripNotFound(updateItem(outsiderId, tripId, itemId, "{\"expectedVersion\":1,\"checked\":true}"));
			expectTripNotFound(deleteItem(outsiderId, tripId, itemId));
		}
		expectTripNotFound(getChecklist(ownerId, UUID.randomUUID()));

		// 내가 멤버인 다른 여행 경로로 이 여행의 항목을 고칠 수 없다
		UUID otherTripId = createTrip(ownerId);
		expectItemNotFound(updateItem(ownerId, otherTripId, itemId, "{\"expectedVersion\":1,\"checked\":true}"));
		expectItemNotFound(deleteItem(ownerId, otherTripId, itemId));
		expectItemNotFound(updateItem(ownerId, tripId, UUID.randomUUID(), "{\"expectedVersion\":1,\"checked\":true}"));
		assertThat(count("select version from checklist_items where id = ?", itemId)).isEqualTo(1);

		jdbcTemplate.update("update trips set deleted_at = now() where id = ?", tripId);
		expectTripNotFound(getChecklist(ownerId, tripId));
	}

	@Test
	void documentsChecklistApi() throws Exception {
		JsonNode docs = jsonMapper.readTree(mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/checklist'].get.tags[0]").value("준비물"))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/checklist'].post.responses['201']").exists())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/checklist/{itemId}'].patch.responses['409'].description")
						.value(containsString("VERSION_CONFLICT")))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/checklist/{itemId}'].delete.responses['204']").exists())
				.andReturn().getResponse().getContentAsString());

		JsonNode schemas = docs.get("components").get("schemas");
		// 보낸 필드를 기록하는 내부 값(sentLabel 등)은 문서에 드러나지 않아야 한다
		assertThat(schemas.get("UpdateChecklistItemRequest").get("properties").propertyNames())
				.containsExactlyInAnyOrder("expectedVersion", "label", "checked");
		assertThat(schemas.get("ChecklistItemResponse").get("properties").propertyNames())
				.containsExactlyInAnyOrder("id", "label", "checked", "checkedByMemberId", "checkedAt", "source",
						"sourceJobId", "reason", "modifiedByUser", "version");
	}

	private void expectValidationError(ResultActions result, String field) throws Exception {
		result.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields[0].field").value(field));
	}

	private void expectTripNotFound(ResultActions result) throws Exception {
		result.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
	}

	private void expectItemNotFound(ResultActions result) throws Exception {
		result.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("CHECKLIST_ITEM_NOT_FOUND"));
	}

	private UUID createTrip(UUID userId) throws Exception {
		return id(data(mockMvc.perform(post("/api/v1/trips").with(authUser(userId)).with(csrf())
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"title\":\"제주\"}"))
				.andExpect(status().isCreated())));
	}

	private ResultActions getChecklist(UUID userId, UUID tripId) throws Exception {
		return mockMvc.perform(get("/api/v1/trips/{tripId}/checklist", tripId).with(authUser(userId)));
	}

	private ResultActions addItem(UUID userId, UUID tripId, String body) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/checklist", tripId).with(authUser(userId)).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(body));
	}

	private ResultActions updateItem(UUID userId, UUID tripId, UUID itemId, String body) throws Exception {
		return mockMvc.perform(patch("/api/v1/trips/{tripId}/checklist/{itemId}", tripId, itemId)
				.with(authUser(userId)).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(body));
	}

	private ResultActions deleteItem(UUID userId, UUID tripId, UUID itemId) throws Exception {
		return mockMvc.perform(delete("/api/v1/trips/{tripId}/checklist/{itemId}", tripId, itemId)
				.with(authUser(userId)).with(csrf()));
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

	private UUID id(ResultActions result) throws Exception {
		return id(data(result.andExpect(status().isCreated())));
	}

	private UUID id(JsonNode node) {
		return UUID.fromString(node.get("id").asString());
	}

	private UUID memberId(UUID tripId, UUID userId) {
		return jdbcTemplate.queryForObject("select id from trip_members where trip_id = ? and user_id = ?",
				UUID.class, tripId, userId);
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

	private void insertMember(UUID tripId, UUID userId, long joinOrder, String status) {
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at, left_at)
				values (?, ?, ?, ?, ?, now(), case when ? = 'ACTIVE' then null else now() end)""",
				UUID.randomUUID(), tripId, userId, status, joinOrder, status);
	}

}
