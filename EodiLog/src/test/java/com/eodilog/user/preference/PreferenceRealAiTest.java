package com.eodilog.user.preference;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.job.JobWorker;
import java.util.List;
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

// 실제 AI 서버로 저장 장소 → 추론 → 검증·저장 → GET 확인(EODI-245). 평소 build에서는 건너뛴다
// 실행: ai/를 INTERNAL_API_TOKEN으로 띄운 뒤 AI_E2E_BASE_URL·AI_E2E_INTERNAL_TOKEN을 주고 이 클래스만 돌린다
// 장소 이름에 AI 규칙 키워드(해수욕장·카페)를 넣어 LLM 없이도 결과가 정해지게 한다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIfEnvironmentVariable(named = "AI_E2E_BASE_URL", matches = "https?://.+")
class PreferenceRealAiTest {

	@DynamicPropertySource
	static void aiServer(DynamicPropertyRegistry registry) {
		registry.add("app.ai.base-url", () -> System.getenv("AI_E2E_BASE_URL"));
		registry.add("app.ai.internal-token", () -> System.getenv().getOrDefault("AI_E2E_INTERNAL_TOKEN", ""));
	}

	@Autowired MockMvc mockMvc;
	@Autowired JdbcTemplate jdbc;
	@Autowired JobWorker worker;

	private final UUID userId = UUID.randomUUID();

	@AfterEach
	void cleanUp() {
		jdbc.update("delete from jobs where requested_by_user_id=?", userId);
		jdbc.update("delete from user_preferences where user_id=?", userId);
		jdbc.update("delete from user_preference_states where user_id=?", userId);
		jdbc.update("delete from personal_bookmarks where user_id=?", userId);
	}

	@Test
	void realAiInfersAndStoresPreferences() throws Exception {
		jdbc.update("insert into users (id, nickname, profile_completed, created_at, updated_at) values (?, '실제AI', true, now(), now())",
				userId);
		for (String name : List.of("광안리해수욕장", "해운대해수욕장", "송정해변", "모모스커피", "전포카페거리", "흰여울카페")) {
			UUID placeId = UUID.randomUUID();
			jdbc.update("insert into places (id, name, latitude, longitude, source, created_at, updated_at) "
					+ "values (?, ?, 35.1, 129.1, 'MANUAL', now(), now())", placeId, name);
			mockMvc.perform(put("/api/v1/me/bookmarks/{id}", placeId).with(authUser(userId))).andExpect(status().isOk());
		}
		mockMvc.perform(put("/api/v1/me/preferences").with(authUser(userId)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"explicitItems\":[],\"allowInference\":true,\"sharingScope\":\"EXPLICIT_AND_INFERRED\"}"))
				.andExpect(status().isOk());
		UUID jobId = jdbc.queryForObject("select id from jobs where requested_by_user_id=? and kind='PREFERENCE_INFERENCE'",
				UUID.class, userId);

		long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(60);
		while (!List.of("SUCCEEDED", "FAILED", "CANCELLED").contains(state(jobId)) && System.nanoTime() < until) {
			if (!worker.pollOnce()) LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(50));
		}
		assertThat(state(jobId)).isEqualTo("SUCCEEDED");
		mockMvc.perform(get("/api/v1/me/preferences").with(authUser(userId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.inferredItems[?(@.key=='바다')]").exists())
				.andExpect(jsonPath("$.data.inferredItems[?(@.key=='카페')]").exists());
	}

	private String state(UUID jobId) {
		return jdbc.queryForObject("select status from jobs where id=?", String.class, jobId);
	}
}
