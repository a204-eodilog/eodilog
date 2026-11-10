package com.eodilog.weather;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.job.JobWorker;
import com.eodilog.weather.dto.Weather;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.LockSupport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
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

// 실제 기상청 조회 → 실제 AI 날씨 대안 → WEATHER 제안 → 적용 → 되돌리기(분담 문서 완료 기준). 평소 build에서는 건너뛴다
// KMA_SERVICE_KEY, AI_E2E_BASE_URL(·AI_E2E_INTERNAL_TOKEN)을 주고 ai/를 띄운 뒤 돌린다
// AI는 비 오는 시간의 실외 일정에만 대안을 내므로, 실제 예보에서 비(강수확률 0.6 이상)가 있는 도시·날짜·시각을 찾아 코스를 만든다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIfEnvironmentVariable(named = "KMA_SERVICE_KEY", matches = ".+")
@EnabledIfEnvironmentVariable(named = "AI_E2E_BASE_URL", matches = "https?://.+")
class WeatherAlternativeRealAiTest {

	private static final ZoneId KST = ZoneId.of("Asia/Seoul");
	// 해변(실외) 좌표. 비 예보를 찾을 후보 도시
	private static final double[][] CITIES = {{35.1587, 129.1604}, {37.7956, 128.9086}, {33.5432, 126.6697},
			{34.7376, 127.7491}, {37.4782, 126.6175}, {36.3089, 126.5119}, {35.4893, 129.4316}};

	@DynamicPropertySource
	static void servers(DynamicPropertyRegistry registry) {
		registry.add("app.ai.base-url", () -> System.getenv("AI_E2E_BASE_URL"));
		registry.add("app.ai.internal-token", () -> System.getenv().getOrDefault("AI_E2E_INTERNAL_TOKEN", ""));
		registry.add("app.weather.service-key", () -> System.getenv("KMA_SERVICE_KEY"));
	}

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
	void realWeatherAlternativeToAppliedCourse() throws Exception {
		Rain rain = findRain();
		Assumptions.assumeTrue(rain != null, "가까운 3일 동안 후보 도시에 비 예보가 없어 대안을 확인할 수 없음");
		System.out.printf("[E2E] rain at %.4f,%.4f %s %s%n", rain.latitude, rain.longitude, rain.date, rain.startTime);

		UUID userId = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, '연동', true, now(), now())""", userId);
		tripId = UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(userId))
				.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"title\":\"날씨\",\"startDate\":\"%s\",\"endDate\":\"%s\"}".formatted(rain.date, rain.date)))
				.andExpect(status().isCreated())).get("id").asString());
		UUID beach = insertPlace("연동 해변", rain.latitude, rain.longitude, "여행,명소>해수욕장");
		UUID indoor = insertPlace("연동 실내 카페", rain.latitude + 0.002, rain.longitude + 0.002, "음식>커피점/카페>카페");
		mockMvc.perform(put("/api/v1/trips/{tripId}/saved-places/{placeId}/me", tripId, indoor).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());
		mockMvc.perform(put("/api/v1/trips/{tripId}/itinerary", tripId).with(authUser(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"expectedVersion":1,"items":[{"placeId":"%s","day":1,"order":1,"startTime":"%s","stayMinutes":60}],
								 "legs":[]}""".formatted(beach, rain.startTime)))
				.andExpect(status().isOk());

		mockMvc.perform(get("/api/v1/trips/{tripId}/weather", tripId).with(authUser(userId))
						.param("date", rain.date.toString()).param("placeId", beach.toString()))
				.andExpect(status().isOk());
		UUID jobId = jobId(mockMvc.perform(post("/api/v1/trips/{tripId}/weather-alternatives", tripId)
				.with(authUser(userId)).header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"date\":\"%s\",\"placeId\":\"%s\",\"expectedVersion\":2}".formatted(rain.date, beach)))
				.andExpect(status().isAccepted()));
		runUntil(jobId);
		assertThat(state(jobId)).isEqualTo("SUCCEEDED");
		JsonNode result = data(mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(userId))))
				.get("result");
		System.out.println("[E2E] alternatives " + result.get("alternatives"));
		JsonNode chosen = null;
		for (JsonNode alternative : result.get("alternatives")) {
			if (chosen == null && !alternative.get("type").asString().equals("INFO")) {
				chosen = alternative;
			}
		}
		assertThat(chosen).as("비 오는 실외 일정에는 TIME_SHIFT나 PLACE_SWAP이 있어야 한다").isNotNull();

		UUID proposalId = jobId(mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/proposals", tripId)
				.with(authUser(userId)).header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"reason\":\"WEATHER\",\"expectedVersion\":2,\"sourceWeatherJobId\":\"%s\",\"selectedAlternativeId\":\"%s\"}"
						.formatted(jobId, chosen.get("alternativeId").asString())))
				.andExpect(status().isAccepted()));
		runUntil(proposalId);
		assertThat(state(proposalId)).isEqualTo("SUCCEEDED");
		JsonNode applied = data(mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/proposals/{jobId}/apply",
						tripId, proposalId).with(authUser(userId)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"expectedVersion\":2}")).andExpect(status().isOk()));
		System.out.println("[E2E] applied " + applied.get("items"));
		assertThat(applied.get("version").asLong()).isEqualTo(3);
		mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/undo", tripId).with(authUser(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"expectedVersion\":3,\"appliedJobId\":\"%s\"}".formatted(proposalId)))
				.andExpect(status().isOk());
	}

	private record Rain(double latitude, double longitude, LocalDate date, String startTime) {
	}

	// 비 시간에 시작해 한 시간 머무는 일정. 내일부터 3일 뒤까지, 09~19시 시작만 본다
	private Rain findRain() {
		LocalDate today = LocalDate.now(KST);
		for (int days = 1; days <= 3; days++) {
			LocalDate date = today.plusDays(days);
			for (double[] city : CITIES) {
				Weather weather = weatherService.forecast(UUID.randomUUID(), city[0], city[1], date);
				for (Weather.Hourly hour : weather.hourly()) {
					LocalDateTime local = LocalDateTime.ofInstant(hour.at(), KST);
					if (hour.precipitationProbability() != null && hour.precipitationProbability() >= 0.6
							&& local.getHour() >= 9 && local.getHour() <= 19 && hour.at().isAfter(Instant.now())) {
						return new Rain(city[0], city[1], date, "%02d:00".formatted(local.getHour()));
					}
				}
			}
		}
		return null;
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
