package com.eodilog.weather;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.ai.AiServerClient;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.job.JobWorker;
import com.eodilog.weather.kma.KmaForecastClient;
import com.eodilog.weather.kma.KmaForecastClient.KmaUnavailableException;
import com.eodilog.weather.kma.KmaForecastClient.ShortTermValue;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.LockSupport;
import java.util.function.Function;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

// 날씨 조회 → 날씨 대안 → WEATHER 코스 제안 → 적용 → 되돌리기(EODI-247). 기상청·AI 서버는 가짜로 바꾸고 실제 jobs worker를 돌린다
// 날씨는 서버 시계 기준 오늘부터 10일 뒤까지만 되므로 여행 날짜를 오늘 기준으로 만든다
// 테스트 DB는 다른 테스트 클래스와 공유한다. 끝날 때 내 undo 행과 작업을 지운다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class WeatherApiTest {

	private static final ZoneId KST = ZoneId.of("Asia/Seoul");
	private static final UUID TIME_SHIFT_ID = UUID.fromString("0193c2a1-0000-7000-8000-000000000001");
	private static final UUID PLACE_SWAP_ID = UUID.fromString("0193c2a1-0000-7000-8000-000000000002");
	private static final UUID INFO_ID = UUID.fromString("0193c2a1-0000-7000-8000-000000000003");

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

	@MockitoBean
	private AiServerClient aiServerClient;

	@MockitoBean
	private KmaForecastClient kmaForecastClient;

	private final List<UUID> trips = new ArrayList<>();

	private LocalDate day1;
	private UUID ownerId;
	private UUID friendId;
	private UUID outsiderId;
	private UUID tripId;
	private UUID beach;
	private UUID cafe;
	private UUID savedIndoor;
	private UUID museum;
	private UUID laundromat;
	private UUID farMuseum;
	private UUID unknownKto;
	private UUID beachItemId;
	private UUID cafeItemId;
	private Function<JsonNode, JsonNode> alternativesAnswer;

	@BeforeEach
	void setUp() throws Exception {
		weatherService.clearCache();
		day1 = LocalDate.now(KST).plusDays(1);
		ownerId = insertUser("방장");
		friendId = insertUser("동행");
		outsiderId = insertUser("남");
		tripId = createTrip(ownerId, day1, day1.plusDays(1));
		insertMember(tripId, friendId, 2);
		// 대상 주변. 반경 2km 안: 저장한 실내 카페, KTO 박물관, SBDC 세탁소, 분류 없는 KTO / 밖: 5km 떨어진 KTO
		// 테스트 DB를 공유하므로 다른 테스트가 남긴 장소와 섞이지 않게 주변에 장소가 없는 곳을 고른다
		double[] spot = emptySpot();
		double lat = spot[0];
		double lon = spot[1];
		beach = insertPlace("해운대해수욕장", lat, lon, null, "여행,명소>해수욕장");
		cafe = insertPlace("바다 카페", lat + 0.0013, lon + 0.0016, null, "음식>커피점/카페>카페");
		savedIndoor = insertPlace("저장한 실내 카페", lat + 0.0008, lon + 0.0011, null, "음식>커피점/카페>카페");
		museum = insertPlace("해운대 박물관", lat + 0.0023, lon + 0.0026, "KTO", "문화시설");
		laundromat = insertPlace("해운대 세탁소", lat + 0.0003, lon + 0.0006, "SBDC", "생활서비스>세탁소");
		farMuseum = insertPlace("먼 미술관", lat + 0.05, lon, "KTO", "문화시설");
		unknownKto = insertPlace("분류 없는 관광지", lat + 0.0005, lon + 0.0008, "KTO", null);
		savePlace(ownerId, tripId, savedIndoor);
		savePlace(ownerId, tripId, cafe);
		JsonNode course = data(replaceCourse(ownerId, tripId, 1, """
				[{"placeId":"%s","day":1,"order":1,"startTime":"10:00","stayMinutes":120},
				 {"placeId":"%s","day":1,"order":2,"startTime":"13:00","stayMinutes":60}]""".formatted(beach, cafe),
				"[{\"day\":1,\"fromOrder\":1,\"toOrder\":2,\"transportMode\":\"WALK\"}]").andExpect(status().isOk()));
		beachItemId = UUID.fromString(course.get("items").get(0).get("id").asString());
		cafeItemId = UUID.fromString(course.get("items").get(1).get("id").asString());

		// 1·2일차 09~12시 비(강수확률 0.8), 그 뒤 맑음
		List<ShortTermValue> values = new ArrayList<>();
		for (LocalDate date : List.of(day1, day1.plusDays(1))) {
			for (int hour = 9; hour <= 20; hour++) {
				boolean rain = hour <= 12;
				LocalTime time = LocalTime.of(hour, 0);
				values.add(new ShortTermValue("TMP", date, time, "12"));
				values.add(new ShortTermValue("POP", date, time, rain ? "80" : "10"));
				values.add(new ShortTermValue("PTY", date, time, rain ? "1" : "0"));
				values.add(new ShortTermValue("SKY", date, time, rain ? "4" : "1"));
			}
			values.add(new ShortTermValue("TMN", date, LocalTime.of(6, 0), "9"));
			values.add(new ShortTermValue("TMX", date, LocalTime.of(15, 0), "16"));
		}
		when(kmaForecastClient.shortTerm(any(), any())).thenReturn(Optional.of(values));

		alternativesAnswer = this::alternatives;
		doAnswer(call -> {
			String path = call.getArgument(0);
			JsonNode body = call.getArgument(2);
			return path.equals("/ai/v1/weather-alternatives") ? alternativesAnswer.apply(body) : proposal(body);
		}).when(aiServerClient).post(anyString(), any(), any());
	}

	@AfterEach
	void cleanUp() {
		for (UUID trip : trips) {
			jdbcTemplate.update("""
					delete from itinerary_undo_states where itinerary_id in (select id from itineraries where trip_id = ?)""",
					trip);
			jdbcTemplate.update("delete from jobs where trip_id = ?", trip);
		}
	}

	@Test
	void returnsWeatherForTripPlaceToMembers() throws Exception {
		getWeather(friendId, tripId, day1, beach)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.placeId").value(beach.toString()))
				.andExpect(jsonPath("$.data.date").value(day1.toString()))
				.andExpect(jsonPath("$.data.source").value("KMA_SHORT_TERM_FORECAST"))
				.andExpect(jsonPath("$.data.condition").value("RAIN"))
				.andExpect(jsonPath("$.data.minCelsius").value(9.0))
				.andExpect(jsonPath("$.data.maxCelsius").value(16.0))
				.andExpect(jsonPath("$.data.precipitationProbability").value(0.8))
				.andExpect(jsonPath("$.data.hourly.length()").value(12))
				.andExpect(jsonPath("$.data.hourly[0].precipitationProbability").value(0.8))
				.andExpect(jsonPath("$.data.stale").value(false))
				.andExpect(jsonPath("$.data.queriedAt").isNotEmpty())
				.andExpect(jsonPath("$.data.forecastAt").isNotEmpty());
		// 저장만 한 장소도 된다. 날씨 대안 설정이 꺼져 있어도 조회는 된다
		setWeatherMode(ownerId, "OFF");
		getWeather(ownerId, tripId, day1, savedIndoor).andExpect(status().isOk());

		getWeather(outsiderId, tripId, day1, beach).andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
		expectValidationError(getWeather(ownerId, tripId, day1, museum), "placeId");
		expectValidationError(getWeather(ownerId, tripId, day1.plusDays(5), beach), "date");
		mockMvc.perform(get("/api/v1/trips/{tripId}/weather", tripId).param("placeId", beach.toString())
						.with(authUser(ownerId)))
				.andExpect(status().isBadRequest());
	}

	// Swagger 문서에 두 API와 업무 오류가 실린다(AGENTS 완료 전 확인을 테스트로 대신한다)
	@Test
	void documentsWeatherApis() throws Exception {
		JsonNode docs = jsonMapper.readTree(mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
		JsonNode weather = docs.get("paths").get("/api/v1/trips/{tripId}/weather").get("get");
		assertThat(weather.get("tags").get(0).asString()).isEqualTo("날씨");
		assertThat(weather.get("responses").has("422")).isTrue();
		assertThat(weather.get("responses").has("503")).isTrue();
		JsonNode alternatives = docs.get("paths").get("/api/v1/trips/{tripId}/weather-alternatives").get("post");
		assertThat(alternatives.get("responses").get("409").get("description").asString())
				.contains("AI_FEATURE_DISABLED");
		assertThat(docs.get("paths").get("/api/v1/trips/{tripId}/itinerary/proposals").get("post").get("responses")
				.get("422").get("description").asString()).contains("UNSCHEDULABLE_ALTERNATIVE");
	}

	@Test
	void providerFailureIsUnavailable() throws Exception {
		when(kmaForecastClient.shortTerm(any(), any())).thenThrow(new KmaUnavailableException("down"));
		getWeather(ownerId, tripId, day1, beach)
				.andExpect(status().isServiceUnavailable())
				.andExpect(jsonPath("$.error.code").value("PROVIDER_UNAVAILABLE"));
		// 날씨를 못 받으면 대안 작업도 만들지 않는다
		requestAlternatives(ownerId, tripId, UUID.randomUUID().toString(), day1, beach, 2)
				.andExpect(status().isServiceUnavailable());
		assertThat(count("select count(*) from jobs where trip_id = ?", tripId)).isZero();
	}

	@Test
	void alternativesFlowToPlaceSwapApplyAndUndo() throws Exception {
		String key = UUID.randomUUID().toString();
		UUID jobId = jobId(requestAlternatives(ownerId, tripId, key, day1, beach, 2)
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.data.status").value("QUEUED")));
		// 같은 키·같은 본문이면 같은 작업
		requestAlternatives(ownerId, tripId, key, day1, beach, 2)
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.data.jobId").value(jobId.toString()));
		runUntil(jobId, Set.of("SUCCEEDED"));

		// AI에 보낸 입력: 고정한 날씨, 그날 코스(분류 포함), 후보(저장 장소 먼저, KTO만, 반경 안, 분류 있음, 그날 코스 제외)
		JsonNode sent = sentTo("/ai/v1/weather-alternatives", jobId);
		assertThat(sent.get("date").asString()).isEqualTo(day1.toString());
		assertThat(sent.get("placeId").asString()).isEqualTo(beach.toString());
		assertThat(sent.get("expectedVersion").asLong()).isEqualTo(2);
		assertThat(sent.get("weather").get("source").asString()).isEqualTo("KMA_SHORT_TERM_FORECAST");
		assertThat(sent.get("weather").get("hourly").size()).isEqualTo(12);
		assertThat(sent.get("dayItems").size()).isEqualTo(2);
		assertThat(sent.get("dayItems").get(0).get("id").asString()).isEqualTo(beachItemId.toString());
		assertThat(sent.get("dayItems").get(0).get("place").get("category").asString()).isEqualTo("여행,명소>해수욕장");
		assertThat(sent.get("dayItems").get(0).get("startTime").asString()).isEqualTo("10:00");
		List<UUID> pool = new ArrayList<>();
		sent.get("alternativePool").forEach(entry -> pool.add(UUID.fromString(entry.get("place").get("id").asString())));
		assertThat(pool).containsExactly(savedIndoor, museum);
		assertThat(sent.get("alternativePool").get(1).get("place").get("category").asString()).isEqualTo("문화시설");
		assertThat(sent.get("alternativePool").get(1).get("openStatus").get("value").asString()).isEqualTo("UNKNOWN");
		assertThat(sent.get("alternativePool").get(1).get("openStatus").get("checkedAt").isNull()).isTrue();
		assertThat(sent.get("defaultTransportMode").asString()).isEqualTo("WALK");

		// 결과는 공통 작업 조회로 본다. 공개 장소에 category·imageUrl이 실리고 날씨는 입력에 고정한 값이다
		mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(friendId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.result.baseVersion").value(2))
				.andExpect(jsonPath("$.data.result.alternatives.length()").value(3))
				.andExpect(jsonPath("$.data.result.alternatives[0].type").value("TIME_SHIFT"))
				.andExpect(jsonPath("$.data.result.alternatives[0].itemId").value(beachItemId.toString()))
				.andExpect(jsonPath("$.data.result.alternatives[0].targetStartTime").value("14:00"))
				.andExpect(jsonPath("$.data.result.alternatives[1].alternativeId").value(PLACE_SWAP_ID.toString()))
				.andExpect(jsonPath("$.data.result.alternatives[1].place.name").value("해운대 박물관"))
				.andExpect(jsonPath("$.data.result.alternatives[1].place.category").value("문화시설"))
				.andExpect(jsonPath("$.data.result.alternatives[1].place.imageUrl").value(nullValue()))
				.andExpect(jsonPath("$.data.result.alternatives[2].type").value("INFO"))
				.andExpect(jsonPath("$.data.result.alternatives[2].place").isEmpty())
				.andExpect(jsonPath("$.data.result.weather.source").value("KMA_SHORT_TERM_FORECAST"));
		mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(outsiderId)))
				.andExpect(status().isNotFound());
		// 대안은 코스를 바꾸지 않는다
		getCourse(ownerId).andExpect(jsonPath("$.data.version").value(2));

		// 장소 바꾸기 대안으로 WEATHER 제안 → 요청하지 않은 멤버가 적용 → 되돌리기
		UUID proposalId = jobId(requestProposal(ownerId, tripId, UUID.randomUUID().toString(),
				weatherProposal(2, jobId, PLACE_SWAP_ID)).andExpect(status().isAccepted()));
		runUntil(proposalId, Set.of("SUCCEEDED"));
		JsonNode proposalInput = sentTo("/ai/v1/itinerary-proposals", proposalId);
		assertThat(proposalInput.get("reason").asString()).isEqualTo("WEATHER");
		assertThat(proposalInput.get("selectedAlternative").get("alternativeId").asString())
				.isEqualTo(PLACE_SWAP_ID.toString());
		List<UUID> places = new ArrayList<>();
		proposalInput.get("places").forEach(place -> places.add(UUID.fromString(place.get("id").asString())));
		assertThat(places).containsExactlyInAnyOrder(beach, cafe, museum);
		assertThat(proposalInput.get("current").get("items").size()).isEqualTo(2);

		mockMvc.perform(get("/api/v1/trips/{tripId}/itinerary/proposals/{jobId}", tripId, proposalId)
						.with(authUser(friendId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.reason").value("WEATHER"))
				.andExpect(jsonPath("$.data.diff.addedPlaceIds[0]").value(museum.toString()))
				.andExpect(jsonPath("$.data.diff.removedPlaceIds[0]").value(beach.toString()));
		apply(friendId, tripId, proposalId, 2)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(3))
				.andExpect(jsonPath("$.data.items[0].place.id").value(museum.toString()))
				.andExpect(jsonPath("$.data.items[0].startTime").value("10:00"))
				.andExpect(jsonPath("$.data.items[1].id").value(cafeItemId.toString()))
				.andExpect(jsonPath("$.data.legs[0].durationSeconds").value(300));
		undo(ownerId, tripId, 3, proposalId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(4))
				.andExpect(jsonPath("$.data.items[0].id").value(beachItemId.toString()));
		// 같은 날씨 대안은 코스가 바뀌었으므로 다시 쓸 수 없다
		requestProposal(ownerId, tripId, UUID.randomUUID().toString(), weatherProposal(4, jobId, TIME_SHIFT_ID))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
	}

	@Test
	void timeShiftMovesSameItem() throws Exception {
		UUID jobId = succeededAlternatives();
		UUID proposalId = jobId(requestProposal(friendId, tripId, UUID.randomUUID().toString(),
				weatherProposal(2, jobId, TIME_SHIFT_ID)).andExpect(status().isAccepted()));
		runUntil(proposalId, Set.of("SUCCEEDED"));
		apply(ownerId, tripId, proposalId, 2)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.items[0].id").value(cafeItemId.toString()))
				.andExpect(jsonPath("$.data.items[1].id").value(beachItemId.toString()))
				.andExpect(jsonPath("$.data.items[1].startTime").value("14:00"));
		apply(ownerId, tripId, proposalId, 3)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("ALREADY_APPLIED"));
	}

	@Test
	void rejectsInvalidAlternativeRequests() throws Exception {
		mockMvc.perform(post("/api/v1/trips/{tripId}/weather-alternatives", tripId).with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"date\":\"%s\",\"placeId\":\"%s\",\"expectedVersion\":2}".formatted(day1, beach)))
				.andExpect(status().isBadRequest());
		mockMvc.perform(post("/api/v1/trips/{tripId}/weather-alternatives", tripId).with(authUser(ownerId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields.length()").value(3));
		requestAlternatives(outsiderId, tripId, UUID.randomUUID().toString(), day1, beach, 2)
				.andExpect(status().isNotFound());
		expectValidationError(requestAlternatives(ownerId, tripId, UUID.randomUUID().toString(), day1.plusDays(5),
				beach, 2), "date");
		// 저장 장소지만 그 날짜 코스에는 없다
		requestAlternatives(ownerId, tripId, UUID.randomUUID().toString(), day1, savedIndoor, 2)
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.error.code").value("INSUFFICIENT_DATA"))
				.andExpect(jsonPath("$.error.fields[0].field").value("placeId"));
		requestAlternatives(ownerId, tripId, UUID.randomUUID().toString(), day1.plusDays(1), beach, 2)
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.error.fields[0].field").value("placeId"));
		requestAlternatives(ownerId, tripId, UUID.randomUUID().toString(), day1, beach, 1)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
		setWeatherMode(ownerId, "OFF");
		requestAlternatives(ownerId, tripId, UUID.randomUUID().toString(), day1, beach, 2)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("AI_FEATURE_DISABLED"));
		jdbcTemplate.update("update trips set start_date = null, end_date = null where id = ?", tripId);
		requestAlternatives(friendId, tripId, UUID.randomUUID().toString(), day1, beach, 2)
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.error.fields[0].field").value("trip.startDate"));
		assertThat(count("select count(*) from jobs where trip_id = ?", tripId)).isZero();
	}

	@Test
	void invalidAiResultFailsAndEmptyResultSucceeds() throws Exception {
		// 후보 밖 장소(SBDC 세탁소)로 바꾸자는 응답은 버린다
		alternativesAnswer = body -> {
			ObjectNode data = (ObjectNode) alternatives(body);
			((ObjectNode) data.get("alternatives").get(1).get("place")).put("id", laundromat.toString());
			return data;
		};
		UUID failed = jobId(requestAlternatives(ownerId, tripId, UUID.randomUUID().toString(), day1, beach, 2));
		runUntil(failed, Set.of("FAILED"));

		alternativesAnswer = body -> {
			ObjectNode data = (ObjectNode) alternatives(body);
			data.putArray("alternatives");
			return data;
		};
		UUID empty = jobId(requestAlternatives(ownerId, tripId, UUID.randomUUID().toString(), day1, beach, 2));
		runUntil(empty, Set.of("SUCCEEDED"));
		mockMvc.perform(get("/api/v1/jobs/{jobId}", empty).with(authUser(ownerId)))
				.andExpect(jsonPath("$.data.result.alternatives.length()").value(0));
	}

	@Test
	void rejectsInvalidWeatherProposals() throws Exception {
		UUID jobId = succeededAlternatives();
		requestProposal(ownerId, tripId, UUID.randomUUID().toString(), weatherProposal(2, jobId, INFO_ID))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.error.code").value("UNSCHEDULABLE_ALTERNATIVE"));
		expectValidationError(requestProposal(ownerId, tripId, UUID.randomUUID().toString(),
				weatherProposal(2, jobId, UUID.randomUUID())), "selectedAlternativeId");
		expectValidationError(requestProposal(ownerId, tripId, UUID.randomUUID().toString(),
				"{\"reason\":\"WEATHER\",\"expectedVersion\":2,\"selectedAlternativeId\":\"%s\"}".formatted(PLACE_SWAP_ID)),
				"sourceWeatherJobId");
		// PLACE_REMOVED는 EODI-278부터 지원한다. 뺄 장소(excludedPlaceIds)가 없으면 400이다
		expectValidationError(requestProposal(ownerId, tripId, UUID.randomUUID().toString(),
				"{\"reason\":\"PLACE_REMOVED\",\"expectedVersion\":2}"), "excludedPlaceIds");
		requestProposal(ownerId, tripId, UUID.randomUUID().toString(), weatherProposal(2, UUID.randomUUID(), PLACE_SWAP_ID))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("JOB_NOT_FOUND"));

		// 다른 여행의 날씨 대안은 쓸 수 없다
		UUID otherTrip = createTrip(ownerId, day1, day1);
		requestProposal(ownerId, otherTrip, UUID.randomUUID().toString(), weatherProposal(1, jobId, PLACE_SWAP_ID))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("JOB_NOT_FOUND"));

		// 아직 끝나지 않은 날씨 대안
		UUID queued = jobId(requestAlternatives(ownerId, tripId, UUID.randomUUID().toString(), day1, beach, 2));
		requestProposal(ownerId, tripId, UUID.randomUUID().toString(), weatherProposal(2, queued, PLACE_SWAP_ID))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("PROPOSAL_NOT_READY"));
		runUntil(queued, Set.of("SUCCEEDED"));

		// 요청자 설정 OFF
		setWeatherMode(friendId, "OFF");
		requestProposal(friendId, tripId, UUID.randomUUID().toString(), weatherProposal(2, jobId, PLACE_SWAP_ID))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("AI_FEATURE_DISABLED"));

		// 제안은 만들었지만 적용하는 사람의 설정이 OFF
		UUID proposalId = jobId(requestProposal(ownerId, tripId, UUID.randomUUID().toString(),
				weatherProposal(2, jobId, PLACE_SWAP_ID)).andExpect(status().isAccepted()));
		runUntil(proposalId, Set.of("SUCCEEDED"));
		apply(friendId, tripId, proposalId, 2)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("AI_FEATURE_DISABLED"));

		// 대안을 만든 뒤 코스를 손으로 바꾸면 오래된 대안이다
		replaceCourse(ownerId, tripId, 2, """
				[{"placeId":"%s","day":1,"order":1,"startTime":"11:00","stayMinutes":120}]""".formatted(beach), "[]")
				.andExpect(status().isOk());
		requestProposal(ownerId, tripId, UUID.randomUUID().toString(), weatherProposal(3, jobId, TIME_SHIFT_ID))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
	}

	@Test
	void tripDateShiftMakesWeatherAlternativeStale() throws Exception {
		UUID jobId = succeededAlternatives();
		UUID proposalId = jobId(requestProposal(ownerId, tripId, UUID.randomUUID().toString(),
				weatherProposal(2, jobId, TIME_SHIFT_ID)).andExpect(status().isAccepted()));
		runUntil(proposalId, Set.of("SUCCEEDED"));

		// 같은 길이로 하루 당기면 코스 version은 그대로지만 대안의 날짜(day1)가 2일차가 된다
		jdbcTemplate.update("update trips set start_date = start_date - 1, end_date = end_date - 1 where id = ?", tripId);
		requestProposal(ownerId, tripId, UUID.randomUUID().toString(), weatherProposal(2, jobId, PLACE_SWAP_ID))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
		apply(ownerId, tripId, proposalId, 2)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));

		// 되돌리면 그대로 쓸 수 있다
		jdbcTemplate.update("update trips set start_date = start_date + 1, end_date = end_date + 1 where id = ?", tripId);
		apply(ownerId, tripId, proposalId, 2).andExpect(status().isOk());
	}

	@Test
	void sameKeyReplaysFirstJobWithoutRefetchingWeather() throws Exception {
		String key = UUID.randomUUID().toString();
		UUID first = jobId(requestAlternatives(ownerId, tripId, key, day1, beach, 2).andExpect(status().isAccepted()));

		// 기상청 장애·캐시 없음·설정 OFF여도 같은 키·같은 본문은 처음 JobRef다
		weatherService.clearCache();
		when(kmaForecastClient.shortTerm(any(), any())).thenThrow(new KmaUnavailableException("down"));
		setWeatherMode(ownerId, "OFF");
		assertThat(jobId(requestAlternatives(ownerId, tripId, key, day1, beach, 2).andExpect(status().isAccepted())))
				.isEqualTo(first);
		requestAlternatives(ownerId, tripId, key, day1, cafe, 2)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("IDEMPOTENCY_KEY_REUSED"));
		assertThat(count("select count(*) from jobs where trip_id = ?", tripId)).isOne();
	}

	@Test
	void requesterWhoLeavesBeforeRunCancelsJob() throws Exception {
		UUID jobId = jobId(requestAlternatives(friendId, tripId, UUID.randomUUID().toString(), day1, beach, 2));
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where trip_id = ? and user_id = ?",
				tripId, friendId);
		runUntil(jobId, Set.of("CANCELLED"));
		mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(friendId)))
				.andExpect(status().isNotFound());
	}

	private UUID succeededAlternatives() throws Exception {
		UUID jobId = jobId(requestAlternatives(ownerId, tripId, UUID.randomUUID().toString(), day1, beach, 2)
				.andExpect(status().isAccepted()));
		runUntil(jobId, Set.of("SUCCEEDED"));
		return jobId;
	}

	// AI spec §6 응답: 14시로 옮기기, 박물관으로 바꾸기, 준비물 안내
	private JsonNode alternatives(JsonNode body) {
		JsonNode target = body.get("dayItems").get(0);
		JsonNode swap = null;
		for (JsonNode entry : body.get("alternativePool")) {
			if (entry.get("place").get("name").asString().equals("해운대 박물관")) {
				swap = entry.get("place");
			}
		}
		ObjectNode data = jsonMapper.createObjectNode();
		ArrayNode alternatives = data.putArray("alternatives");
		alternatives.addObject().put("alternativeId", TIME_SHIFT_ID.toString()).put("type", "TIME_SHIFT")
				.putNull("place").put("itemId", target.get("id").asString()).put("targetStartTime", "14:00")
				.put("activity", "해운대해수욕장을 오후로 옮기기").put("reason", "비 그친 뒤 14:00 · 13시부터 그쳐요 (예보)");
		ObjectNode swapNode = alternatives.addObject().put("alternativeId", PLACE_SWAP_ID.toString())
				.put("type", "PLACE_SWAP");
		swapNode.set("place", swap.deepCopy());
		swapNode.put("itemId", target.get("id").asString()).putNull("targetStartTime")
				.put("activity", "해운대 박물관").put("reason", "도보 5분 · 영업 정보 없음");
		alternatives.addObject().put("alternativeId", INFO_ID.toString()).put("type", "INFO").putNull("place")
				.putNull("itemId").putNull("targetStartTime").put("activity", "우산 챙기기").put("reason", "비 소식이 있어요");
		data.set("weather", body.get("weather"));
		data.put("baseVersion", body.get("expectedVersion").asLong());
		return data;
	}

	// AI spec §5 WEATHER 응답. PLACE_SWAP은 새 항목(id null)을 같은 시각에, TIME_SHIFT는 같은 항목을 옮기고 시각순으로 다시 매긴다
	private JsonNode proposal(JsonNode body) {
		JsonNode selected = body.get("selectedAlternative");
		JsonNode beachItem = body.get("current").get("items").get(0);
		JsonNode cafeItem = body.get("current").get("items").get(1);
		ObjectNode data = jsonMapper.createObjectNode();
		data.put("baseVersion", body.get("expectedVersion").asLong());
		data.put("reason", "WEATHER");
		ObjectNode proposed = data.putObject("proposed");
		ArrayNode items = proposed.putArray("items");
		if (selected.get("type").asString().equals("PLACE_SWAP")) {
			JsonNode swapPlace = null;
			for (JsonNode place : body.get("places")) {
				if (place.get("id").asString().equals(selected.get("place").get("id").asString())) {
					swapPlace = place;
				}
			}
			ObjectNode swapped = items.addObject().putNull("id");
			swapped.set("place", swapPlace);
			swapped.put("day", 1).put("order", 1).put("startTime", "10:00").put("stayMinutes", 90);
			items.add(((ObjectNode) cafeItem.deepCopy()).put("order", 2));
		} else {
			items.add(((ObjectNode) cafeItem.deepCopy()).put("order", 1));
			items.add(((ObjectNode) beachItem.deepCopy()).put("order", 2)
					.put("startTime", selected.get("targetStartTime").asString()));
		}
		proposed.putArray("legs").addObject().putNull("fromItemId").putNull("toItemId").put("day", 1)
				.put("fromOrder", 1).put("toOrder", 2).put("transportMode", "WALK").put("durationSeconds", 300)
				.putNull("distanceMeters").putNull("geometry").put("status", "AVAILABLE")
				.put("queriedAt", "2026-11-09T00:00:00Z");
		data.putObject("diff").put("description", "1일차를 날씨에 맞춰 바꿨어요").putArray("removedPlaceIds");
		((ObjectNode) data.get("diff")).putArray("addedPlaceIds");
		data.putNull("appliedAt");
		data.put("canUndo", false);
		return data;
	}

	private JsonNode sentTo(String path, UUID jobId) {
		ArgumentCaptor<JsonNode> body = ArgumentCaptor.forClass(JsonNode.class);
		verify(aiServerClient, org.mockito.Mockito.atLeastOnce()).post(eq(path), eq(jobId), body.capture());
		return body.getValue();
	}

	private String weatherProposal(long version, UUID sourceJobId, UUID alternativeId) {
		return "{\"reason\":\"WEATHER\",\"expectedVersion\":%d,\"sourceWeatherJobId\":\"%s\",\"selectedAlternativeId\":\"%s\"}"
				.formatted(version, sourceJobId, alternativeId);
	}

	private ResultActions getWeather(UUID userId, UUID trip, LocalDate date, UUID placeId) throws Exception {
		return mockMvc.perform(get("/api/v1/trips/{tripId}/weather", trip).with(authUser(userId))
				.param("date", date.toString()).param("placeId", placeId.toString()));
	}

	private ResultActions requestAlternatives(UUID userId, UUID trip, String key, LocalDate date, UUID placeId,
			long version) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/weather-alternatives", trip).with(authUser(userId))
				.header(IdempotencyService.HEADER_NAME, key).contentType(MediaType.APPLICATION_JSON)
				.content("{\"date\":\"%s\",\"placeId\":\"%s\",\"expectedVersion\":%d}".formatted(date, placeId, version)));
	}

	private ResultActions requestProposal(UUID userId, UUID trip, String key, String body) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/proposals", trip).with(authUser(userId))
				.header(IdempotencyService.HEADER_NAME, key).contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private ResultActions apply(UUID userId, UUID trip, UUID jobId, long expectedVersion) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/proposals/{jobId}/apply", trip, jobId)
				.with(authUser(userId)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"expectedVersion\":" + expectedVersion + "}"));
	}

	private ResultActions undo(UUID userId, UUID trip, long expectedVersion, UUID jobId) throws Exception {
		return mockMvc.perform(post("/api/v1/trips/{tripId}/itinerary/undo", trip).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"expectedVersion\":%d,\"appliedJobId\":\"%s\"}".formatted(expectedVersion, jobId)));
	}

	private ResultActions getCourse(UUID userId) throws Exception {
		return mockMvc.perform(get("/api/v1/trips/{tripId}/itinerary", tripId).with(authUser(userId)));
	}

	private ResultActions replaceCourse(UUID userId, UUID trip, long expectedVersion, String items, String legs)
			throws Exception {
		return mockMvc.perform(put("/api/v1/trips/{tripId}/itinerary", trip).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"expectedVersion\":%d,\"items\":%s,\"legs\":%s}".formatted(expectedVersion, items, legs)));
	}

	// 다른 테스트가 남긴 작업이 먼저 선점될 수 있으므로 내 작업이 원하는 상태가 될 때까지 선점을 반복한다
	private void runUntil(UUID jobId, Set<String> expected) {
		long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
		while (!expected.contains(state(jobId)) && System.nanoTime() < until) {
			if (!state(jobId).equals("QUEUED") || !worker.pollOnce()) {
				LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(10));
			}
		}
		assertThat(state(jobId)).isIn(expected);
	}

	private String state(UUID jobId) {
		return jdbcTemplate.queryForObject("select status from jobs where id = ?", String.class, jobId);
	}

	private void expectValidationError(ResultActions result, String field) throws Exception {
		result.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields[0].field").value(field));
	}

	private UUID jobId(ResultActions result) throws Exception {
		return UUID.fromString(data(result).get("jobId").asString());
	}

	private UUID createTrip(UUID userId, LocalDate start, LocalDate end) throws Exception {
		UUID id = UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(userId))
				.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"title\":\"부산\",\"startDate\":\"%s\",\"endDate\":\"%s\"}".formatted(start, end)))
				.andExpect(status().isCreated())).get("id").asString());
		trips.add(id);
		return id;
	}

	private void savePlace(UUID userId, UUID trip, UUID placeId) throws Exception {
		mockMvc.perform(put("/api/v1/trips/{tripId}/saved-places/{placeId}/me", trip, placeId).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isOk());
	}

	private void setWeatherMode(UUID userId, String mode) {
		jdbcTemplate.update("""
				insert into user_settings (user_id, weather_mode) values (?, ?)
				on conflict (user_id) do update set weather_mode = excluded.weather_mode""", userId, mode);
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

	private void insertMember(UUID trip, UUID userId, long joinOrder) {
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at)
				values (?, ?, ?, 'ACTIVE', ?, now())""", UUID.randomUUID(), trip, userId, joinOrder);
	}

	// 국내 아무 곳이나 무작위로 고르되 10km 안에 장소가 하나라도 있으면 다시 고른다. 무작위만으로는 앞 테스트가 남긴
	// 관광공사 장소가 가끔 대안 후보 반경(2km)에 들어와 후보 목록 검사가 실패했다(EODI-287). 5km 밖 장소도 이 안에 든다
	private double[] emptySpot() {
		for (int attempt = 0; attempt < 50; attempt++) {
			double lat = 34.8 + ThreadLocalRandom.current().nextDouble(2.5);
			double lon = 126.9 + ThreadLocalRandom.current().nextDouble(1.8);
			Boolean taken = jdbcTemplate.queryForObject("""
					select exists(select 1 from places where ST_DWithin(
					  ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography,
					  ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, 10000))""", Boolean.class, lon, lat);
			if (!Boolean.TRUE.equals(taken)) {
				return new double[] { lat, lon };
			}
		}
		throw new IllegalStateException("주변에 장소가 없는 좌표를 찾지 못했습니다");
	}

	private UUID insertPlace(String name, double latitude, double longitude, String provider, String category) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into places (id, name, latitude, longitude, provider, provider_place_id, source, category,
				                    created_at, updated_at)
				values (?, ?, ?, ?, ?, ?, ?, ?, now(), now())""", id, name, latitude, longitude, provider,
				provider == null ? null : id.toString(), provider == null ? "MANUAL" : "PROVIDER", category);
		return id;
	}

}
