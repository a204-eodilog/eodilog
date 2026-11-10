package com.eodilog.itinerary.proposal;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.job.JobWorker;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.LockSupport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 실제 AI 서버로 INITIAL 제안 → 적용 → 되돌리기(분담 문서 완료 기준). 평소 build에서는 건너뛴다
// AI 코스 제안(EODI-150)이 구현된 뒤 ai/를 INTERNAL_API_TOKEN으로 띄우고 AI_E2E_BASE_URL·AI_E2E_INTERNAL_TOKEN을 주고 돌린다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIfEnvironmentVariable(named = "AI_E2E_BASE_URL", matches = "https?://.+")
class ItineraryProposalRealAiTest {

	@DynamicPropertySource
	static void aiServer(DynamicPropertyRegistry registry) {
		registry.add("app.ai.base-url", () -> System.getenv("AI_E2E_BASE_URL"));
		registry.add("app.ai.internal-token", () -> System.getenv().getOrDefault("AI_E2E_INTERNAL_TOKEN", ""));
	}

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	@Autowired
	private JobWorker worker;

	private UUID tripId;

	@AfterEach
	void cleanUp() {
		if (tripId != null) {
			jdbcTemplate.update("""
					delete from itinerary_undo_states where itinerary_id in (select id from itineraries where trip_id = ?)""",
					tripId);
			jdbcTemplate.update("delete from jobs where trip_id = ?", tripId);
		}
	}

	@Test
	void proposesAppliesAndUndoesWithRealAiServer() throws Exception {
		UUID userId = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, '연동', true, now(), now())""", userId);
		tripId = UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(userId))
				.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"title\":\"부산\",\"startDate\":\"2026-11-14\",\"endDate\":\"2026-11-15\"}"))
				.andExpect(status().isCreated())).get("id").asString());
		String[][] places = {{"해운대해수욕장", "35.1587", "129.1604"}, {"동백섬", "35.1530", "129.1520"},
				{"광안리해수욕장", "35.1532", "129.1186"}, {"감천문화마을", "35.0975", "129.0106"},
				{"자갈치시장", "35.0966", "129.0306"}};
		UUID firstPlace = null;
		for (String[] place : places) {
			UUID placeId = UUID.randomUUID();
			firstPlace = firstPlace == null ? placeId : firstPlace;
			jdbcTemplate.update("""
					insert into places (id, name, latitude, longitude, source, created_at, updated_at)
					values (?, ?, ?::numeric, ?::numeric, 'MANUAL', now(), now())""", placeId, place[0], place[1], place[2]);
			mockMvc.perform(put("/api/v1/trips/{tripId}/saved-places/{placeId}/me", tripId, placeId)
					.with(authUser(userId)).contentType(MediaType.APPLICATION_JSON).content("{}"))
					.andExpect(status().isOk());
		}

		// 현재 코스에 있는 장소는 AI가 그 항목 id를 유지한다(AI spec AS-16)
		String existingItemId = data(mockMvc.perform(put("/api/v1/trips/{tripId}/itinerary", tripId)
						.with(authUser(userId)).contentType(MediaType.APPLICATION_JSON)
						.content("{\"expectedVersion\":1,\"items\":[{\"placeId\":\"" + firstPlace
								+ "\",\"day\":1,\"order\":1}],\"legs\":[]}"))
				.andExpect(status().isOk())).get("items").get(0).get("id").asString();

		UUID jobId = UUID.fromString(data(mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/proposals", tripId)
				.with(authUser(userId)).header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"INITIAL\",\"expectedVersion\":2}"))
				.andExpect(status().isAccepted())).get("jobId").asString());

		long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(70);
		while (!state(jobId).equals("SUCCEEDED") && !state(jobId).equals("FAILED") && System.nanoTime() < until) {
			if (!state(jobId).equals("QUEUED") || !worker.pollOnce()) {
				LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(50));
			}
		}
		assertThat(state(jobId)).isEqualTo("SUCCEEDED");

		JsonNode proposal = data(mockMvc.perform(get("/api/v1/trips/{tripId}/itinerary/proposals/{jobId}", tripId, jobId)
				.with(authUser(userId))).andExpect(status().isOk()));
		System.out.println("REAL_AI_PROPOSAL " + proposal);
		// T-04-1: 1박 2일 5곳 → 2일에 나눠 각 1회
		assertThat(proposal.get("proposed").get("items").size()).isEqualTo(5);
		long kept = 0;
		for (JsonNode item : proposal.get("proposed").get("items")) {
			if (!item.get("id").isNull()) {
				assertThat(item.get("id").asString()).isEqualTo(existingItemId);
				assertThat(item.get("place").get("id").asString()).isEqualTo(firstPlace.toString());
				kept++;
			}
		}
		assertThat(kept).isEqualTo(1);

		JsonNode applied = data(mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/proposals/{jobId}/apply", tripId,
						jobId).with(authUser(userId)).contentType(MediaType.APPLICATION_JSON)
						.content("{\"expectedVersion\":2}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(3))
				.andExpect(jsonPath("$.data.items.length()").value(5)));
		boolean keptAfterApply = false;
		for (JsonNode item : applied.get("items")) {
			keptAfterApply |= item.get("id").asString().equals(existingItemId);
		}
		assertThat(keptAfterApply).isTrue();
		mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/undo", tripId).with(authUser(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"expectedVersion\":3,\"appliedJobId\":\"" + jobId + "\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(4))
				.andExpect(jsonPath("$.data.items.length()").value(1))
				.andExpect(jsonPath("$.data.items[0].id").value(existingItemId));
	}

	private String state(UUID jobId) {
		return jdbcTemplate.queryForObject("select status from jobs where id = ?", String.class, jobId);
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

}
