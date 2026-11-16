package com.eodilog.weather;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.job.JobWorker;
import com.eodilog.weather.kma.KmaForecastClient;
import com.eodilog.weather.kma.KmaForecastClient.ShortTermValue;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 실제 AI 서버로 날씨 대안 → WEATHER 제안 → 적용 → 되돌리기 계약을 확인한다. 평소 build에서는 건너뛴다
// 비 예보가 없는 날에도 돌 수 있게 기상청 응답만 "내일 09~12시 비, 그 뒤 맑음"으로 바꾼다(실제 기상청은 WeatherRealProviderTest)
// AI_E2E_BASE_URL(·AI_E2E_INTERNAL_TOKEN)을 주고 ai/를 띄운 뒤 돌린다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIfEnvironmentVariable(named = "AI_E2E_BASE_URL", matches = "https?://.+")
class WeatherAlternativeAiContractTest {

	private static final ZoneId KST = ZoneId.of("Asia/Seoul");

	@DynamicPropertySource
	static void servers(DynamicPropertyRegistry registry) {
		registry.add("app.ai.base-url", () -> System.getenv("AI_E2E_BASE_URL"));
		registry.add("app.ai.internal-token", () -> System.getenv().getOrDefault("AI_E2E_INTERNAL_TOKEN", ""));
		registry.add("app.weather.service-key", () -> "contract-test");
	}

	@MockitoBean
	private KmaForecastClient kmaForecastClient;

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	@Autowired
	private JobWorker worker;

	@Autowired
	private WeatherService weatherService;

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
	void realAiAlternativeToAppliedCourse() throws Exception {
		weatherService.clearCache();
		LocalDate date = LocalDate.now(KST).plusDays(1);
		List<ShortTermValue> values = new ArrayList<>();
		for (int hour = 0; hour <= 23; hour++) {
			boolean rain = hour >= 9 && hour <= 12;
			LocalTime time = LocalTime.of(hour, 0);
			values.add(new ShortTermValue("TMP", date, time, "14"));
			values.add(new ShortTermValue("POP", date, time, rain ? "80" : "10"));
			values.add(new ShortTermValue("PTY", date, time, rain ? "1" : "0"));
			values.add(new ShortTermValue("SKY", date, time, rain ? "4" : "1"));
		}
		when(kmaForecastClient.shortTerm(any(), any())).thenReturn(Optional.of(values));

		UUID userId = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, '계약', true, now(), now())""", userId);
		tripId = UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(userId))
				.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"title\":\"날씨 계약\",\"startDate\":\"%s\",\"endDate\":\"%s\"}".formatted(date, date)))
				.andExpect(status().isCreated())).get("id").asString());
		// 테스트 DB를 공유하므로 다른 테스트의 장소와 섞이지 않게 국내 아무 곳이나 고른다
		double lat = 34.8 + ThreadLocalRandom.current().nextDouble(2.5);
		double lon = 126.9 + ThreadLocalRandom.current().nextDouble(1.8);
		UUID beach = insertPlace("계약 해수욕장", lat, lon, "여행,명소>해수욕장");
		UUID indoor = insertPlace("계약 실내 카페", lat + 0.002, lon + 0.002, "음식>커피점/카페>카페");
		mockMvc.perform(put("/api/v1/trips/{tripId}/saved-places/{placeId}/me", tripId, indoor).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());
		mockMvc.perform(put("/api/v1/trips/{tripId}/itinerary", tripId).with(authUser(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"expectedVersion":1,"items":[{"placeId":"%s","day":1,"order":1,"startTime":"10:00","stayMinutes":60}],
								 "legs":[]}""".formatted(beach)))
				.andExpect(status().isOk());

		// 1) version 2에서 대안: 시간 옮기기와 저장한 실내 카페로 바꾸기가 나와야 한다
		UUID firstJob = requestAlternatives(userId, date, beach, 2);
		JsonNode first = alternatives(userId, firstJob);
		assertThat(types(first)).as("비 오는 실외 일정에는 시간 옮기기와 실내 장소 바꾸기가 나와야 한다")
				.contains("TIME_SHIFT", "PLACE_SWAP");

		// 2) TIME_SHIFT 제안 → 적용(3) → 되돌리기(4)
		JsonNode shifted = proposeApplyUndo(userId, firstJob, pick(first, "TIME_SHIFT"), 2);
		assertThat(shifted.get(0).get("startTime").asString()).isNotEqualTo("10:00");

		// 3) 같은 대안 작업의 PLACE_SWAP은 코스가 바뀌었으므로(version 4) 409
		mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/proposals", tripId).with(authUser(userId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON).content(proposalBody(4, firstJob, pick(first, "PLACE_SWAP"))))
				.andExpect(status().isConflict());

		// 4) version 4에서 대안을 다시 받아 PLACE_SWAP 제안 → 적용(5) → 되돌리기(6)
		UUID secondJob = requestAlternatives(userId, date, beach, 4);
		JsonNode swap = pick(alternatives(userId, secondJob), "PLACE_SWAP");
		assertThat(swap.get("place").get("id").asString()).isEqualTo(indoor.toString());
		assertThat(swap.get("place").has("category")).isTrue();
		assertThat(swap.get("place").has("imageUrl")).isTrue();
		JsonNode swapped = proposeApplyUndo(userId, secondJob, swap, 4);
		assertThat(swapped.get(0).get("place").get("id").asString()).isEqualTo(indoor.toString());
	}

	private UUID requestAlternatives(UUID userId, LocalDate date, UUID placeId, long version) throws Exception {
		UUID jobId = jobId(mockMvc.perform(post("/api/v1/trips/{tripId}/weather-alternatives", tripId)
				.with(authUser(userId)).header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"date\":\"%s\",\"placeId\":\"%s\",\"expectedVersion\":%d}".formatted(date, placeId, version)))
				.andExpect(status().isAccepted()));
		runUntil(jobId);
		assertThat(state(jobId)).isEqualTo("SUCCEEDED");
		return jobId;
	}

	private JsonNode alternatives(UUID userId, UUID jobId) throws Exception {
		JsonNode result = data(mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(userId))))
				.get("result").get("alternatives");
		System.out.println("[AI-CONTRACT] alternatives " + result);
		return result;
	}

	private static List<String> types(JsonNode alternatives) {
		List<String> types = new ArrayList<>();
		alternatives.forEach(alternative -> types.add(alternative.get("type").asString()));
		return types;
	}

	private static JsonNode pick(JsonNode alternatives, String type) {
		for (JsonNode alternative : alternatives) {
			if (alternative.get("type").asString().equals(type)) {
				return alternative;
			}
		}
		throw new AssertionError(type + " 대안이 없다: " + alternatives);
	}

	private static String proposalBody(long version, UUID sourceJobId, JsonNode alternative) {
		return "{\"reason\":\"WEATHER\",\"expectedVersion\":%d,\"sourceWeatherJobId\":\"%s\",\"selectedAlternativeId\":\"%s\"}"
				.formatted(version, sourceJobId, alternative.get("alternativeId").asString());
	}

	// 제안 → 적용(version+1) → 되돌리기(version+2). 적용된 코스 items를 돌려준다
	private JsonNode proposeApplyUndo(UUID userId, UUID sourceJobId, JsonNode alternative, long version) throws Exception {
		UUID proposalId = jobId(mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/proposals", tripId)
				.with(authUser(userId)).header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON).content(proposalBody(version, sourceJobId, alternative)))
				.andExpect(status().isAccepted()));
		runUntil(proposalId);
		assertThat(state(proposalId)).isEqualTo("SUCCEEDED");
		JsonNode proposal = data(mockMvc.perform(get("/api/v1/trips/{tripId}/itinerary/proposals/{jobId}",
				tripId, proposalId).with(authUser(userId))).andExpect(status().isOk()));
		assertThat(proposal.get("reason").asString()).isEqualTo("WEATHER");
		System.out.println("[AI-CONTRACT] " + alternative.get("type").asString() + " diff " + proposal.get("diff"));
		JsonNode applied = data(mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/proposals/{jobId}/apply",
						tripId, proposalId).with(authUser(userId)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"expectedVersion\":%d}".formatted(version))).andExpect(status().isOk()));
		System.out.println("[AI-CONTRACT] applied " + applied.get("items"));
		assertThat(applied.get("version").asLong()).isEqualTo(version + 1);
		mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/undo", tripId).with(authUser(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"expectedVersion\":%d,\"appliedJobId\":\"%s\"}".formatted(version + 1, proposalId)))
				.andExpect(status().isOk());
		assertThat(currentVersion(userId)).isEqualTo(version + 2);
		return applied.get("items");
	}

	private long currentVersion(UUID userId) throws Exception {
		return data(mockMvc.perform(get("/api/v1/trips/{tripId}/itinerary", tripId).with(authUser(userId)))
				.andExpect(status().isOk())).get("version").asLong();
	}

	private void runUntil(UUID jobId) {
		long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(90);
		while ((state(jobId).equals("QUEUED") || state(jobId).equals("RUNNING")) && System.nanoTime() < until) {
			if (!state(jobId).equals("QUEUED") || !worker.pollOnce()) {
				LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(50));
			}
		}
	}

	private String state(UUID jobId) {
		return jdbcTemplate.queryForObject("select status from jobs where id = ?", String.class, jobId);
	}

	private UUID insertPlace(String name, double latitude, double longitude, String category) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into places (id, name, latitude, longitude, source, category, created_at, updated_at)
				values (?, ?, ?, ?, 'MANUAL', ?, now(), now())""", id, name, latitude, longitude, category);
		return id;
	}

	private UUID jobId(ResultActions result) throws Exception {
		return UUID.fromString(data(result).get("jobId").asString());
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

}
