package com.eodilog.checklist.suggestion;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 실제 AI 서버 연동 확인(분담 문서 완료 기준 "실제 AI 서버 호출 한 번 이상"). 평소 build에서는 건너뛴다
// 실행: ai/를 INTERNAL_API_TOKEN으로 띄운 뒤 AI_E2E_BASE_URL·AI_E2E_INTERNAL_TOKEN을 주고 이 클래스만 돌린다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIfEnvironmentVariable(named = "AI_E2E_BASE_URL", matches = "https?://.+")
class ChecklistSuggestionRealAiTest {

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

	@AfterEach
	void cleanUp() {
		jdbcTemplate.update("delete from checklist_items where source = 'AI'");
		jdbcTemplate.update("delete from jobs where kind = 'CHECKLIST_SUGGESTIONS'");
	}

	@Test
	void callsRealAiServerAndAdoptsSuggestion() throws Exception {
		UUID userId = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, '연동', true, now(), now())""", userId);
		UUID tripId = UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(userId))
				.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"title\":\"부산\",\"startDate\":\"2026-11-14\",\"endDate\":\"2026-11-15\"}"))
				.andExpect(status().isCreated())).get("id").asString());
		UUID placeId = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into places (id, name, latitude, longitude, source, created_at, updated_at)
				values (?, '해운대해수욕장', 35.1587, 129.1604, 'MANUAL', now(), now())""", placeId);
		jdbcTemplate.update("""
				insert into itinerary_items (id, itinerary_id, place_id, day, sequence, start_time, stay_minutes)
				select ?, id, ?, 1, 1, '10:00', 120 from itineraries where trip_id = ?""",
				UUID.randomUUID(), placeId, tripId);
		mockMvc.perform(post("/api/v1/trips/{tripId}/checklist", tripId).with(authUser(userId))
						.contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"충전기\"}"))
				.andExpect(status().isCreated());

		UUID jobId = UUID.fromString(data(mockMvc.perform(post("/api/v1/trips/{tripId}/checklist-suggestions", tripId)
				.with(authUser(userId)).header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString()))
				.andExpect(status().isAccepted())).get("jobId").asString());

		long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(70);
		while (!state(jobId).equals("SUCCEEDED") && !state(jobId).equals("FAILED") && System.nanoTime() < until) {
			if (!state(jobId).equals("QUEUED") || !worker.pollOnce()) {
				LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(50));
			}
		}
		assertThat(state(jobId)).isEqualTo("SUCCEEDED");

		JsonNode result = data(mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(userId)))
				.andExpect(status().isOk())).get("result");
		System.out.println("REAL_AI_RESULT " + result);
		assertThat(result.get("items").size()).isPositive();
		// 이미 있는 준비물은 다시 제안하지 않는다
		for (JsonNode item : result.get("items")) {
			assertThat(item.get("label").asString()).isNotEqualTo("충전기");
			assertThat(item.get("sourceJobId").asString()).isEqualTo(jobId.toString());
		}

		String label = result.get("items").get(0).get("label").asString();
		mockMvc.perform(post("/api/v1/trips/{tripId}/checklist", tripId).with(authUser(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(jsonMapper.createObjectNode().put("label", label).put("sourceJobId", jobId.toString())
								.put("suggestionIndex", 0).toString()))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.source").value("AI"))
				.andExpect(jsonPath("$.data.label").value(label));
	}

	private String state(UUID jobId) {
		return jdbcTemplate.queryForObject("select status from jobs where id = ?", String.class, jobId);
	}

	private JsonNode data(org.springframework.test.web.servlet.ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

}
