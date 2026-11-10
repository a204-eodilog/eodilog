package com.eodilog.extraction;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.ai.AiServerClient;
import com.eodilog.global.ai.AiServerClient.FilePart;
import com.eodilog.global.ai.AiServerException;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.global.storage.InMemoryObjectStorage;
import com.eodilog.global.storage.InMemoryStorageConfiguration;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobOutcome;
import com.eodilog.job.JobSubmission;
import com.eodilog.job.JobWorker;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.LockSupport;
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

// AI 장소 추출 요청 → 작업 실행 → 결과 조회 → 삭제(EODI-224). AI 서버는 가짜로, 저장소는 메모리로 바꾸고 jobs worker를 직접 돌린다
// 테스트 DB는 다른 테스트 클래스와 공유한다. 끝날 때 내 작업·파일·장소를 지운다(정책 S-19·S-20과 같은 이유)
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, InMemoryStorageConfiguration.class})
class ExtractionApiTest {

	private static final String PLACE_ID_PREFIX = "extraction-test-";
	private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 1};
	private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 2};

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	@Autowired
	private JobWorker worker;

	@Autowired
	private InMemoryObjectStorage storage;

	@MockitoBean
	private AiServerClient aiServerClient;

	private final List<UUID> users = new ArrayList<>();
	private UUID ownerId;

	@BeforeEach
	void setUp() {
		ownerId = insertUser("추출");
		answer("""
				{"resultStatus":"NOT_FOUND","candidates":[]}""");
	}

	@AfterEach
	void cleanUp() {
		jdbcTemplate.update("delete from jobs where kind = 'PLACE_EXTRACTION'");
		for (UUID user : users) {
			jdbcTemplate.update("delete from idempotency_records where user_id = ?", user);
			jdbcTemplate.update("delete from user_settings where user_id = ?", user);
			jdbcTemplate.update("delete from assets where owner_user_id = ?", user);
		}
		jdbcTemplate.update("delete from places where provider = 'NAVER' and provider_place_id like ?", PLACE_ID_PREFIX + "%");
	}

	@Test
	void extractsCandidatesFromLinkMemoAndCapturesAndLinksLocalPlaces() throws Exception {
		UUID png = insertCapture(ownerId, "READY", "image/png", PNG);
		UUID jpeg = insertCapture(ownerId, "READY", "image/jpeg", JPEG);
		answer("""
				{"resultStatus":"MULTIPLE_CANDIDATES","candidates":[
				 {"name":"바다 앞 카페","place":%s,"evidence":"캡처 속 간판에서 찾았어요","confidence":1.0},
				 {"name":"바다 앞 카페","place":%s,"evidence":"캡처 속 간판에서 찾았어요","confidence":0.8},
				 {"name":"신기산업","place":null,"evidence":"게시물 글에서 찾았어요","confidence":null},
				 {"name":"엉뚱한 공급자","place":{"name":"x","address":null,"latitude":35.1,"longitude":129.1,"provider":"KAKAO","providerPlaceId":"k1","category":null},"evidence":"메모에서 찾았어요","confidence":0.9},
				 {"name":"남천점","place":%s,"evidence":"메모에서 찾았어요","confidence":1}
				]}""".formatted(naverPlace("1", "바다 앞 카페 남천점"), naverPlace("2", "바다 앞 카페 민락점"),
				naverPlace("1", "바다 앞 카페 남천점")));

		String key = UUID.randomUUID().toString();
		String body = """
				{"url":"  https://blog.example.com/post/1  ","captureAssetIds":["%s","%s"],"memo":"부산 카페"}"""
				.formatted(png, jpeg);
		JsonNode ref = data(requestExtraction(ownerId, key, body)
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.data.status").value("QUEUED")));
		UUID jobId = UUID.fromString(ref.get("jobId").asString());
		// 같은 키·같은 본문은 처음 접수, 같은 키·다른 본문은 409
		requestExtraction(ownerId, key, body).andExpect(status().isAccepted())
				.andExpect(jsonPath("$.data.jobId").value(jobId.toString()));
		requestExtraction(ownerId, key, "{\"url\":\"https://blog.example.com/post/2\"}")
				.andExpect(status().isConflict());
		assertThat(count("select count(*) from jobs where requested_by_user_id = ?", ownerId)).isEqualTo(1);
		// 입력 스냅샷에는 링크·메모·캡처 ID만 있다
		JsonNode input = jsonMapper.readTree(jdbcTemplate.queryForObject(
				"select input_json::text from jobs where id = ?", String.class, jobId));
		assertThat(input.properties()).hasSize(3);
		assertThat(input.get("url").asString()).isEqualTo("https://blog.example.com/post/1");

		extractionResult(ownerId, jobId).andExpect(status().isOk())
				.andExpect(jsonPath("$.data.job.status").value("QUEUED"))
				.andExpect(jsonPath("$.data.resultStatus").isEmpty())
				.andExpect(jsonPath("$.data.candidates", hasSize(0)));

		runUntil(jobId, Set.of("SUCCEEDED"));

		// AI에는 링크·메모와 캡처 표시본 바이트를 보낸다
		@SuppressWarnings("unchecked")
		ArgumentCaptor<Map<String, String>> fields = ArgumentCaptor.forClass(Map.class);
		@SuppressWarnings("unchecked")
		ArgumentCaptor<List<FilePart>> files = ArgumentCaptor.forClass(List.class);
		verify(aiServerClient).postMultipart(eq("/ai/v1/place-extractions"), eq(jobId), fields.capture(), files.capture());
		assertThat(fields.getValue()).containsEntry("url", "https://blog.example.com/post/1").containsEntry("memo", "부산 카페");
		assertThat(files.getValue()).hasSize(2);
		assertThat(files.getValue().get(0).field()).isEqualTo("captures");
		assertThat(files.getValue().get(0).filename()).isEqualTo("capture-1.png");
		assertThat(files.getValue().get(0).contentType()).isEqualTo("image/png");
		assertThat(files.getValue().get(0).bytes()).isEqualTo(PNG);
		assertThat(files.getValue().get(1).filename()).isEqualTo("capture-2.jpg");
		assertThat(files.getValue().get(1).bytes()).isEqualTo(JPEG);

		JsonNode result = data(extractionResult(ownerId, jobId).andExpect(status().isOk())
				.andExpect(jsonPath("$.data.job.kind").value("PLACE_EXTRACTION"))
				.andExpect(jsonPath("$.data.job.status").value("SUCCEEDED"))
				.andExpect(jsonPath("$.data.resultStatus").value("MULTIPLE_CANDIDATES"))
				.andExpect(jsonPath("$.data.candidates", hasSize(5))));
		JsonNode candidates = result.get("candidates");
		UUID nam = placeId(PLACE_ID_PREFIX + "1");
		assertThat(candidates.get(0).get("place").get("id").asString()).isEqualTo(nam.toString());
		assertThat(candidates.get(0).get("place").get("source").asString()).isEqualTo("PROVIDER");
		assertThat(candidates.get(0).get("place").get("provider").asString()).isEqualTo("NAVER");
		assertThat(candidates.get(0).get("place").get("name").asString()).isEqualTo("바다 앞 카페 남천점");
		// 네이버 응답에는 지역 코드가 없어 주소("부산 수영구 …")로 지역을 찾는다
		assertThat(candidates.get(0).get("place").get("regionId").asString()).isEqualTo(jdbcTemplate.queryForObject(
				"select id::text from regions where name = '부산광역시 수영구'", String.class));
		assertThat(candidates.get(0).get("confidence").asDouble()).isEqualTo(1.0);
		assertThat(candidates.get(1).get("place").get("id").asString()).isEqualTo(placeId(PLACE_ID_PREFIX + "2").toString());
		assertThat(candidates.get(2).get("place").isNull()).isTrue();
		assertThat(candidates.get(2).get("confidence").isNull()).isTrue();
		assertThat(candidates.get(2).get("evidence").asString()).isEqualTo("게시물 글에서 찾았어요");
		// 다른 공급자 장소는 연결하지 않고 장소 없음 후보로 둔다
		assertThat(candidates.get(3).get("place").isNull()).isTrue();
		assertThat(candidates.get(3).get("confidence").isNull()).isTrue();
		// 같은 공급자 장소는 같은 로컬 장소 하나로 모은다
		assertThat(candidates.get(4).get("place").get("id").asString()).isEqualTo(nam.toString());
		Set<String> candidateIds = new java.util.HashSet<>();
		candidates.forEach(candidate -> candidateIds.add(candidate.get("candidateId").asString()));
		assertThat(candidateIds).hasSize(5);
		assertThat(count("select count(*) from places where provider = 'NAVER' and provider_place_id like ?",
				PLACE_ID_PREFIX + "%")).isEqualTo(2);
		// 네이버 분류는 공개 응답에 싣지 않고 장소 행에만 남긴다(날씨 대안의 실내·실외 판단용)
		assertThat(jdbcTemplate.queryForObject("select category from places where id = ?", String.class, nam))
				.isEqualTo("카페,디저트>카페");
		assertThat(candidates.get(0).get("place").has("category")).isFalse();
		// 일반 작업 조회도 같은 결과를 준다. 추출은 저장·방문을 만들지 않는다
		mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(ownerId))).andExpect(status().isOk())
				.andExpect(jsonPath("$.data.result.resultStatus").value("MULTIPLE_CANDIDATES"))
				.andExpect(jsonPath("$.data.result.candidates", hasSize(5)));
		assertThat(count("select count(*) from personal_bookmarks where user_id = ?", ownerId)).isZero();

		// 고른 후보는 기존 개인 저장 API로 저장한다
		mockMvc.perform(put("/api/v1/me/bookmarks/{placeId}", nam).with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isOk());
		jdbcTemplate.update("delete from personal_bookmarks where user_id = ?", ownerId);
	}

	@Test
	void acceptsLinkOnlyOrCapturesOnly() throws Exception {
		UUID linkOnly = request(ownerId, "{\"url\":\"http://example.com:80/a?b=1#c\"}");
		runUntil(linkOnly, Set.of("SUCCEEDED"));
		UUID capture = insertCapture(ownerId, "READY", "image/jpeg", JPEG);
		UUID capturesOnly = request(ownerId, "{\"captureAssetIds\":[\"%s\"],\"memo\":\"  \"}".formatted(capture));
		runUntil(capturesOnly, Set.of("SUCCEEDED"));

		@SuppressWarnings("unchecked")
		ArgumentCaptor<Map<String, String>> fields = ArgumentCaptor.forClass(Map.class);
		@SuppressWarnings("unchecked")
		ArgumentCaptor<List<FilePart>> files = ArgumentCaptor.forClass(List.class);
		verify(aiServerClient).postMultipart(anyString(), eq(linkOnly), fields.capture(), files.capture());
		assertThat(fields.getValue().get("url")).isEqualTo("http://example.com:80/a?b=1#c");
		assertThat(files.getValue()).isEmpty();
		verify(aiServerClient).postMultipart(anyString(), eq(capturesOnly), fields.capture(), files.capture());
		assertThat(fields.getValue().get("url")).isNull();
		assertThat(fields.getValue().get("memo")).isNull();
		assertThat(files.getValue()).hasSize(1);
		extractionResult(ownerId, capturesOnly).andExpect(jsonPath("$.data.resultStatus").value("NOT_FOUND"));
	}

	@Test
	void rejectsInvalidRequestsBeforeQueueing() throws Exception {
		expectInvalid(requestExtraction(ownerId, null, "{\"url\":\"https://example.com\"}"), IdempotencyService.HEADER_NAME);
		expectInvalid(requestExtraction(ownerId, key(), "{}"), "url");
		expectInvalid(requestExtraction(ownerId, key(), "{\"url\":\" \",\"captureAssetIds\":[]}"), "url");
		for (String url : List.of("ftp://example.com/a", "https://user:pw@example.com/a", "https://example.com:8080/a",
				"example.com/a", "https:///a", "https://exa mple.com", "https://example.com/" + "a".repeat(2048))) {
			expectInvalid(requestExtraction(ownerId, key(), jsonMapper.createObjectNode().put("url", url).toString()), "url");
		}
		expectInvalid(requestExtraction(ownerId, key(),
				jsonMapper.createObjectNode().put("url", "https://example.com").put("memo", "가".repeat(501)).toString()), "memo");
		UUID capture = insertCapture(ownerId, "READY", "image/png", PNG);
		expectInvalid(requestExtraction(ownerId, key(), "{\"captureAssetIds\":[\"%s\",\"%s\"]}".formatted(capture, capture)),
				"captureAssetIds");
		requestExtraction(ownerId, key(), "{\"url\":\"https://example.com\",\"regionHint\":\"부산\"}")
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

		List<String> eleven = new ArrayList<>();
		for (int i = 0; i < 11; i++) {
			eleven.add("\"" + UUID.randomUUID() + "\"");
		}
		requestExtraction(ownerId, key(), "{\"captureAssetIds\":[" + String.join(",", eleven) + "]}")
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.error.code").value("INPUT_LIMIT_EXCEEDED"));

		UUID strangerId = insertUser("남");
		UUID others = insertCapture(strangerId, "READY", "image/png", PNG);
		UUID pending = insertCapture(ownerId, "PENDING", "image/png", PNG);
		UUID deleting = insertCapture(ownerId, "DELETING", "image/png", PNG);
		UUID profile = insertAsset(ownerId, "PROFILE", "READY", "image/png", PNG);
		for (UUID invalid : List.of(others, pending, deleting, profile, UUID.randomUUID())) {
			expectInvalid(requestExtraction(ownerId, key(), "{\"captureAssetIds\":[\"%s\",\"%s\"]}".formatted(capture, invalid)),
					"captureAssetIds[1]");
		}

		setExtractionMode(ownerId, "OFF");
		requestExtraction(ownerId, key(), "{\"url\":\"https://example.com\"}")
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("AI_FEATURE_DISABLED"));

		assertThat(count("select count(*) from jobs where requested_by_user_id = ?", ownerId)).isZero();
		verify(aiServerClient, never()).postMultipart(anyString(), any(), anyMap(), anyList());
	}

	@Test
	void skipsUnreadableCapturesAndFailsWithoutCallingAiWhenNothingIsReadable() throws Exception {
		UUID kept = insertCapture(ownerId, "READY", "image/png", PNG);
		UUID missingObject = insertCapture(ownerId, "READY", "image/jpeg", JPEG);
		UUID turnedDeleting = insertCapture(ownerId, "READY", "image/jpeg", JPEG);
		UUID partial = request(ownerId, "{\"captureAssetIds\":[\"%s\",\"%s\",\"%s\"]}".formatted(missingObject, kept, turnedDeleting));
		storage.delete("display/" + missingObject);
		jdbcTemplate.update("update assets set status = 'DELETING' where id = ?", turnedDeleting);
		runUntil(partial, Set.of("SUCCEEDED"));
		@SuppressWarnings("unchecked")
		ArgumentCaptor<List<FilePart>> files = ArgumentCaptor.forClass(List.class);
		verify(aiServerClient).postMultipart(anyString(), eq(partial), anyMap(), files.capture());
		assertThat(files.getValue()).hasSize(1);
		assertThat(files.getValue().getFirst().bytes()).isEqualTo(PNG);
		assertThat(files.getValue().getFirst().filename()).isEqualTo("capture-1.png");

		UUID gone = insertCapture(ownerId, "READY", "image/png", PNG);
		UUID nothing = request(ownerId, "{\"captureAssetIds\":[\"%s\"],\"memo\":\"메모만 남음\"}".formatted(gone));
		storage.delete("display/" + gone);
		runUntil(nothing, Set.of("SUCCEEDED"));
		verify(aiServerClient, never()).postMultipart(anyString(), eq(nothing), anyMap(), anyList());
		extractionResult(ownerId, nothing).andExpect(jsonPath("$.data.resultStatus").value("FAILED"))
				.andExpect(jsonPath("$.data.candidates", hasSize(0)));
	}

	@Test
	void retriesTemporaryFailuresAndFailsOnRejectedOrMalformedResponses() throws Exception {
		doThrow(new AiServerException(true)).when(aiServerClient).postMultipart(anyString(), any(), anyMap(), anyList());
		UUID temporary = request(ownerId, "{\"url\":\"https://example.com/1\"}");
		runUntilFailureRecorded(temporary);
		assertThat(state(temporary)).isEqualTo("QUEUED");
		assertThat(jdbcTemplate.queryForObject("select error_code from jobs where id = ?", String.class, temporary))
				.isEqualTo("TEMPORARY_FAILURE");
		extractionResult(ownerId, temporary).andExpect(jsonPath("$.data.job.status").value("QUEUED"))
				.andExpect(jsonPath("$.data.job.error").isEmpty());
		jdbcTemplate.update("delete from jobs where id = ?", temporary);

		doThrow(new AiServerException(false)).when(aiServerClient).postMultipart(anyString(), any(), anyMap(), anyList());
		UUID rejected = request(ownerId, "{\"url\":\"https://example.com/2\"}");
		runUntil(rejected, Set.of("FAILED"));
		extractionResult(ownerId, rejected).andExpect(jsonPath("$.data.job.error.code").value("EXECUTION_FAILED"))
				.andExpect(jsonPath("$.data.resultStatus").isEmpty())
				.andExpect(jsonPath("$.data.candidates", hasSize(0)));

		for (String malformed : List.of("{\"resultStatus\":\"MAYBE\",\"candidates\":[]}", "{\"resultStatus\":\"SUCCESS\"}",
				"{\"resultStatus\":\"SUCCESS\",\"candidates\":[{\"name\":\" \",\"place\":null,\"evidence\":\"e\",\"confidence\":null}]}",
				"{\"resultStatus\":\"SUCCESS\",\"candidates\":[{\"name\":\"a\",\"place\":null,\"evidence\":\"e\",\"confidence\":1.5}]}")) {
			answer(malformed);
			UUID jobId = request(ownerId, jsonMapper.createObjectNode().put("url", "https://example.com/" + UUID.randomUUID()).toString());
			runUntil(jobId, Set.of("FAILED"));
		}
	}

	@Test
	void cancelsQueuedJobWhenSettingTurnsOffAndHidesJobsFromOthers() throws Exception {
		UUID jobId = request(ownerId, "{\"url\":\"https://example.com\"}");
		setExtractionMode(ownerId, "OFF");
		runUntil(jobId, Set.of("CANCELLED"));
		verify(aiServerClient, never()).postMultipart(anyString(), any(), anyMap(), anyList());
		extractionResult(ownerId, jobId).andExpect(jsonPath("$.data.job.error.code").value("POLICY_REVOKED"));

		UUID strangerId = insertUser("남");
		extractionResult(strangerId, jobId).andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("JOB_NOT_FOUND"));
		mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId).with(authUser(strangerId))).andExpect(status().isNotFound());
		mockMvc.perform(delete("/api/v1/extractions/{jobId}", jobId).with(authUser(strangerId)))
				.andExpect(status().isNotFound());
		extractionResult(ownerId, UUID.randomUUID()).andExpect(status().isNotFound());
		assertThat(count("select count(*) from jobs where id = ? and deleted_at is null", jobId)).isEqualTo(1);
	}

	@Test
	void deletesJobInputAndCapturesNotUsedByAnotherExtraction() throws Exception {
		UUID own = insertCapture(ownerId, "READY", "image/png", PNG);
		UUID shared = insertCapture(ownerId, "READY", "image/png", PNG);
		UUID queued = request(ownerId, "{\"captureAssetIds\":[\"%s\",\"%s\"]}".formatted(own, shared));
		UUID other = request(ownerId, "{\"captureAssetIds\":[\"%s\"]}".formatted(shared));

		mockMvc.perform(delete("/api/v1/extractions/{jobId}", queued).with(authUser(ownerId)))
				.andExpect(status().isNoContent());
		assertThat(jdbcTemplate.queryForMap("""
				select status, error_code, input_json::text as input, result_json, finished_at is not null as finished,
				deleted_at is not null as deleted from jobs where id = ?""", queued))
				.containsEntry("status", "CANCELLED").containsEntry("error_code", "POLICY_REVOKED")
				.containsEntry("input", "{}").containsEntry("finished", true).containsEntry("deleted", true);
		assertThat(jdbcTemplate.queryForObject("select result_json from jobs where id = ?", String.class, queued)).isNull();
		// 다른 추출이 쓰는 캡처는 남기고 이 작업만 쓴 캡처는 정리 대상으로 넘긴다
		assertThat(assetStatus(own)).isEqualTo("DELETING");
		assertThat(assetStatus(shared)).isEqualTo("READY");
		extractionResult(ownerId, queued).andExpect(status().isNotFound());
		mockMvc.perform(get("/api/v1/jobs/{jobId}", queued).with(authUser(ownerId))).andExpect(status().isNotFound());
		mockMvc.perform(delete("/api/v1/extractions/{jobId}", queued).with(authUser(ownerId)))
				.andExpect(status().isNotFound());

		// 남은 작업을 지우면 공유하던 캡처도 정리한다. 성공한 작업의 결과도 지운다
		runUntil(other, Set.of("SUCCEEDED"));
		mockMvc.perform(delete("/api/v1/extractions/{jobId}", other).with(authUser(ownerId)))
				.andExpect(status().isNoContent());
		assertThat(assetStatus(shared)).isEqualTo("DELETING");
		assertThat(jdbcTemplate.queryForMap("select status, result_json from jobs where id = ?", other))
				.containsEntry("status", "SUCCEEDED").containsEntry("result_json", null);
		// 지운 캡처로는 새로 요청할 수 없다
		expectInvalid(requestExtraction(ownerId, key(), "{\"captureAssetIds\":[\"%s\"]}".formatted(shared)),
				"captureAssetIds[0]");
	}

	@Test
	void dropsLateResultAfterDeletingRunningJob() throws Exception {
		CountDownLatch called = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		JsonNode late = jsonMapper.readTree("{\"resultStatus\":\"SUCCESS\",\"candidates\":[{\"name\":\"늦은 결과\",\"place\":null,"
				+ "\"evidence\":\"메모에서 찾았어요\",\"confidence\":null}]}");
		doAnswer(invocation -> {
			called.countDown();
			release.await(10, TimeUnit.SECONDS);
			return late;
		}).when(aiServerClient).postMultipart(anyString(), any(), anyMap(), anyList());
		UUID jobId = request(ownerId, "{\"url\":\"https://example.com/late\"}");
		try {
			long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
			while (called.getCount() > 0 && System.nanoTime() < until) {
				if (!worker.pollOnce()) {
					LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(10));
				}
			}
			assertThat(called.await(1, TimeUnit.SECONDS)).isTrue();
			assertThat(state(jobId)).isEqualTo("RUNNING");
			UUID executionId = jdbcTemplate.queryForObject("select execution_id from jobs where id = ?", UUID.class, jobId);

			mockMvc.perform(delete("/api/v1/extractions/{jobId}", jobId).with(authUser(ownerId)))
					.andExpect(status().isNoContent());

			// 실행 중이던 시도가 결과를 들고 와도 저장하지 않는다
			JobContext context = new JobContext(jobId, executionId, 1, new JobSubmission(ownerId, JobKind.PLACE_EXTRACTION,
					null, jsonMapper.createObjectNode(), null, null));
			assertThat(worker.finish(context, JobOutcome.succeeded(late))).isFalse();
		} finally {
			release.countDown();
		}
		long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
		while (System.nanoTime() < until) {
			LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(50));
		}
		assertThat(jdbcTemplate.queryForMap("select status, result_json, deleted_at is not null as deleted from jobs where id = ?", jobId))
				.containsEntry("status", "CANCELLED").containsEntry("result_json", null).containsEntry("deleted", true);
		extractionResult(ownerId, jobId).andExpect(status().isNotFound());
	}

	@Test
	void documentsExtractionApis() throws Exception {
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/extractions'].post.tags[0]").value("장소 추출"))
				.andExpect(jsonPath("$.paths['/api/v1/extractions'].post.responses['202']").exists())
				.andExpect(jsonPath("$.paths['/api/v1/extractions'].post.responses['422'].description")
						.value(org.hamcrest.Matchers.containsString("INPUT_LIMIT_EXCEEDED")))
				.andExpect(jsonPath("$.paths['/api/v1/extractions'].post.responses['409'].description")
						.value(org.hamcrest.Matchers.containsString("AI_FEATURE_DISABLED")))
				.andExpect(jsonPath("$.paths['/api/v1/extractions/{jobId}'].get.responses['200']").exists())
				.andExpect(jsonPath("$.paths['/api/v1/extractions/{jobId}'].delete.responses['204']").exists())
				.andExpect(jsonPath("$.components.schemas.ExtractionResult.properties.resultStatus").exists())
				.andExpect(jsonPath("$.components.schemas.Candidate.properties.candidateId").exists());
	}

	private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder put(String path, Object... vars) {
		return org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(path, vars);
	}

	private void answer(String data) {
		doReturn(jsonMapper.readTree(data)).when(aiServerClient).postMultipart(anyString(), any(), anyMap(), anyList());
	}

	private String naverPlace(String suffix, String name) {
		return jsonMapper.createObjectNode().put("name", name).put("address", "부산 수영구 광안해변로 " + suffix)
				.put("latitude", 35.1531234567891).put("longitude", 129.1189876543).put("provider", "NAVER")
				.put("providerPlaceId", PLACE_ID_PREFIX + suffix).put("category", "카페,디저트>카페").toString();
	}

	private UUID request(UUID userId, String body) throws Exception {
		JsonNode ref = data(requestExtraction(userId, key(), body).andExpect(status().isAccepted()));
		return UUID.fromString(ref.get("jobId").asString());
	}

	private ResultActions requestExtraction(UUID userId, String key, String body) throws Exception {
		var request = post("/api/v1/extractions").with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON).content(body);
		if (key != null) {
			request.header(IdempotencyService.HEADER_NAME, key);
		}
		return mockMvc.perform(request);
	}

	private ResultActions extractionResult(UUID userId, UUID jobId) throws Exception {
		return mockMvc.perform(get("/api/v1/extractions/{jobId}", jobId).with(authUser(userId)));
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

	private void runUntilFailureRecorded(UUID jobId) {
		long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
		while (count("select count(*) from jobs where id = ? and attempt = 1 and status = 'QUEUED'", jobId) == 0
				&& System.nanoTime() < until) {
			if (!state(jobId).equals("QUEUED") || !worker.pollOnce()) {
				LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(10));
			}
		}
		assertThat(count("select count(*) from jobs where id = ? and attempt = 1", jobId)).isEqualTo(1);
	}

	private String state(UUID jobId) {
		return jdbcTemplate.queryForObject("select status from jobs where id = ?", String.class, jobId);
	}

	private String assetStatus(UUID assetId) {
		return jdbcTemplate.queryForObject("select status from assets where id = ?", String.class, assetId);
	}

	private UUID placeId(String providerPlaceId) {
		return jdbcTemplate.queryForObject("select id from places where provider = 'NAVER' and provider_place_id = ?",
				UUID.class, providerPlaceId);
	}

	private void expectInvalid(ResultActions result, String field) throws Exception {
		result.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields[0].field").value(field));
	}

	private static String key() {
		return UUID.randomUUID().toString();
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

	private long count(String sql, Object... args) {
		return jdbcTemplate.queryForObject(sql, Long.class, args);
	}

	private void setExtractionMode(UUID userId, String mode) {
		jdbcTemplate.update("""
				insert into user_settings (user_id, extraction_mode) values (?, ?)
				on conflict (user_id) do update set extraction_mode = excluded.extraction_mode""", userId, mode);
	}

	private UUID insertUser(String nickname) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, ?, true, now(), now())""", id, nickname);
		users.add(id);
		return id;
	}

	private UUID insertCapture(UUID ownerId, String status, String contentType, byte[] displayBytes) {
		return insertAsset(ownerId, "CAPTURE", status, contentType, displayBytes);
	}

	// 업로드·확인(complete)이 끝난 것처럼 행과 표시본을 직접 넣는다. 원본은 업로드 기한 뒤 정리된 상태로 본다
	private UUID insertAsset(UUID ownerId, String purpose, String status, String contentType, byte[] displayBytes) {
		UUID id = UUID.randomUUID();
		boolean ready = !"PENDING".equals(status);
		jdbcTemplate.update("""
				insert into assets (id, owner_user_id, purpose, object_key, display_key, content_type, display_content_type,
				  byte_size, status, created_at, upload_expires_at, expires_at)
				values (?, ?, ?, ?, ?, ?, ?, ?, ?, now() - interval '1 hour', now() - interval '50 minutes', now() + interval '23 hours')""",
				id, ownerId, purpose, "uploads/" + id, "display/" + id, contentType, ready ? contentType : null,
				displayBytes.length, status);
		if (ready) {
			storage.put("display/" + id, displayBytes, contentType);
		}
		return id;
	}

}
