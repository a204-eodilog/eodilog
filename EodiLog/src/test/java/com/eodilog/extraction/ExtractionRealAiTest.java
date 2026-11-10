package com.eodilog.extraction;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.ai.AiServerClient;
import com.eodilog.global.ai.AiServerClient.FilePart;
import com.eodilog.global.ai.AiServerException;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.global.storage.InMemoryObjectStorage;
import com.eodilog.global.storage.InMemoryStorageConfiguration;
import com.eodilog.job.JobWorker;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.LockSupport;
import javax.imageio.ImageIO;
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

// 실제 AI 서버 연동 확인(분담 문서 완료 기준: 실제 연동과 대체 테스트를 구분해 기록). 평소 build에서는 건너뛴다
// 실행: ai/를 INTERNAL_API_TOKEN으로 띄운 뒤 AI_E2E_BASE_URL·AI_E2E_INTERNAL_TOKEN을 주고 이 클래스만 돌린다
// GMS 키가 없는 AI 서버는 LLM 단계에서 503을 준다. 그 경우 multipart가 AI의 입력 검사·이미지 변환을 통과해 LLM까지 갔다는 것까지 확인한다
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, InMemoryStorageConfiguration.class})
@EnabledIfEnvironmentVariable(named = "AI_E2E_BASE_URL", matches = "https?://.+")
class ExtractionRealAiTest {

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

	@Autowired
	private InMemoryObjectStorage storage;

	@Autowired
	private AiServerClient aiServerClient;

	private UUID userId;

	@AfterEach
	void cleanUp() {
		jdbcTemplate.update("delete from jobs where kind = 'PLACE_EXTRACTION'");
		if (userId != null) {
			jdbcTemplate.update("delete from idempotency_records where user_id = ?", userId);
			jdbcTemplate.update("delete from assets where owner_user_id = ?", userId);
		}
	}

	@Test
	void sendsLinkMemoAndCaptureToRealAiServer() throws Exception {
		userId = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, '연동', true, now(), now())""", userId);
		UUID captureId = UUID.randomUUID();
		byte[] png = png();
		jdbcTemplate.update("""
				insert into assets (id, owner_user_id, purpose, object_key, display_key, content_type, display_content_type,
				  byte_size, status, created_at, upload_expires_at, expires_at)
				values (?, ?, 'CAPTURE', ?, ?, 'image/png', 'image/png', ?, 'READY', now() - interval '1 hour',
				  now() - interval '50 minutes', now() + interval '23 hours')""",
				captureId, userId, "uploads/" + captureId, "display/" + captureId, png.length);
		storage.put("display/" + captureId, png, "image/png");

		String body = jsonMapper.createObjectNode().put("url", "https://example.com/").put("memo", "부산 해운대 카페 메모")
				.set("captureAssetIds", jsonMapper.createArrayNode().add(captureId.toString())).toString();
		UUID jobId = UUID.fromString(data(mockMvc.perform(post("/api/v1/extractions").with(authUser(userId))
				.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isAccepted())).get("jobId").asString());

		// 첫 시도의 결과(성공·실패·재시도 대기)가 기록될 때까지만 돌린다
		long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(70);
		while (attempt(jobId) == 0 || state(jobId).equals("RUNNING")) {
			if (System.nanoTime() > until) {
				break;
			}
			if (!state(jobId).equals("QUEUED") || !worker.pollOnce()) {
				LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(50));
			}
		}
		Map<String, Object> row = jdbcTemplate.queryForMap("select status, error_code, attempt, result_json::text as result from jobs where id = ?", jobId);
		System.out.println("REAL_AI_EXTRACTION " + row);
		JsonNode extraction = data(mockMvc.perform(get("/api/v1/extractions/{jobId}", jobId).with(authUser(userId)))
				.andExpect(status().isOk()));
		System.out.println("REAL_AI_EXTRACTION_RESULT " + extraction);
		// GMS 키가 있으면 성공, 없으면 LLM 503 → 일시 실패로 재시도 대기. 4xx(형식·입력 오류)는 multipart가 잘못된 것이다
		if ("SUCCEEDED".equals(row.get("status"))) {
			assertThat(extraction.get("resultStatus").isNull()).isFalse();
		} else {
			assertThat(row).containsEntry("status", "QUEUED").containsEntry("error_code", "TEMPORARY_FAILURE");
		}
	}

	@Test
	void realAiServerReadsCapturesAsFileList() throws Exception {
		List<FilePart> eleven = new ArrayList<>();
		byte[] png = png();
		for (int i = 1; i <= 11; i++) {
			eleven.add(new FilePart("captures", "capture-" + i + ".png", "image/png", png));
		}
		// AI가 captures를 파일 목록으로 읽어야 11장 한도(422 INPUT_LIMIT_EXCEEDED)에 걸린다. 재시도하지 않는 실패다
		assertThatThrownBy(() -> aiServerClient.postMultipart(PlaceExtractionJobHandler.AI_PATH, UUID.randomUUID(),
				Map.of("memo", "열한 장"), eleven))
				.isInstanceOfSatisfying(AiServerException.class, ex -> assertThat(ex.retryable()).isFalse());
	}

	private static byte[] png() throws Exception {
		BufferedImage image = new BufferedImage(64, 64, BufferedImage.TYPE_INT_RGB);
		var graphics = image.createGraphics();
		graphics.setColor(Color.ORANGE);
		graphics.fillRect(0, 0, 64, 64);
		graphics.dispose();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(image, "png", out);
		return out.toByteArray();
	}

	private int attempt(UUID jobId) {
		return jdbcTemplate.queryForObject("select attempt from jobs where id = ?", Integer.class, jobId);
	}

	private String state(UUID jobId) {
		return jdbcTemplate.queryForObject("select status from jobs where id = ?", String.class, jobId);
	}

	private JsonNode data(org.springframework.test.web.servlet.ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

}
