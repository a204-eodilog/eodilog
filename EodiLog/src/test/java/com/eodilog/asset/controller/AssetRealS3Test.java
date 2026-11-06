package com.eodilog.asset.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.storage.ObjectStorage;
import java.io.IOException;
import java.io.Reader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Properties;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
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

// 실제 S3 개발 버킷 왕복 확인. 기본 빌드에서는 건너뛰고 `gradlew test --tests "*AssetRealS3Test" -PrealS3=true`로만 돈다
// EodiLog/.env의 STORAGE_BUCKET·STORAGE_REGION·AWS 키를 쓰고, 만든 객체는 끝에 지운다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIfSystemProperty(named = "eodilog.realS3", matches = "true")
class AssetRealS3Test {

	// HttpClient가 직접 정하는 헤더. 서명 URL 헤더 중 이것들은 넣지 않아도 같은 값이 나간다
	private static final Set<String> RESTRICTED_HEADERS = Set.of("content-length", "host");
	private static final byte[] PNG = Arrays.copyOf(
			new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'}, 128);

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	@Autowired
	private ObjectStorage objectStorage;

	private final HttpClient http = HttpClient.newHttpClient();

	@DynamicPropertySource
	static void storageFromDotEnv(DynamicPropertyRegistry registry) throws IOException {
		Properties env = new Properties();
		try (Reader reader = Files.newBufferedReader(Path.of(".env"))) {
			env.load(reader);
		}
		registry.add("app.storage.bucket", () -> env.getProperty("STORAGE_BUCKET"));
		registry.add("app.storage.region", () -> env.getProperty("STORAGE_REGION", "ap-northeast-2"));
		registry.add("app.storage.access-key-id", () -> env.getProperty("AWS_ACCESS_KEY_ID"));
		registry.add("app.storage.secret-access-key", () -> env.getProperty("AWS_SECRET_ACCESS_KEY"));
	}

	@Test
	void uploadsThroughPresignedUrlCompletesAndDownloads() throws Exception {
		UUID userId = insertUser();
		JsonNode intent = createIntent(userId);
		UUID assetId = UUID.fromString(intent.get("assetId").asString());
		String key = objectKey(assetId);
		try {
			assertThat(intent.get("uploadUrl").asString()).startsWith("https://").contains("X-Amz-Signature");
			assertThat(put(intent, PNG)).isEqualTo(200);

			mockMvc.perform(post("/api/v1/assets/{assetId}/complete", assetId).with(authUser(userId)))
					.andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("READY"));
			byte[] body = mockMvc.perform(get("/api/v1/assets/{assetId}/download", assetId).with(authUser(userId)))
					.andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
			assertThat(body).isEqualTo(PNG);
		} finally {
			objectStorage.delete(key);
		}
		assertThat(objectStorage.head(key)).isEmpty();
	}

	@Test
	void signedUrlRejectsOtherContentTypeAndCancelDeletesObject() throws Exception {
		UUID userId = insertUser();
		JsonNode intent = createIntent(userId);
		UUID assetId = UUID.fromString(intent.get("assetId").asString());
		String key = objectKey(assetId);
		try {
			// 서명된 Content-Type과 다르게 올리면 S3가 거부한다
			HttpRequest wrongType = HttpRequest.newBuilder(URI.create(intent.get("uploadUrl").asString()))
					.header("content-type", "text/html")
					.PUT(HttpRequest.BodyPublishers.ofByteArray(PNG)).build();
			assertThat(http.send(wrongType, HttpResponse.BodyHandlers.discarding()).statusCode()).isEqualTo(403);

			assertThat(put(intent, PNG)).isEqualTo(200);
			assertThat(objectStorage.head(key)).isPresent();
			mockMvc.perform(delete("/api/v1/assets/{assetId}", assetId).with(authUser(userId)))
					.andExpect(status().isNoContent());
			assertThat(objectStorage.head(key)).isEmpty();
		} finally {
			objectStorage.delete(key);
		}
	}

	private JsonNode createIntent(UUID userId) throws Exception {
		String response = mockMvc.perform(post("/api/v1/assets/upload-intents").with(authUser(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"purpose\":\"CAPTURE\",\"contentType\":\"image/png\",\"byteSize\":" + PNG.length + "}"))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		return jsonMapper.readTree(response).get("data");
	}

	// 앱이 하는 것처럼 응답의 method·headers 그대로 올린다. Authorization은 붙이지 않는다
	private int put(JsonNode intent, byte[] bytes) throws Exception {
		HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(intent.get("uploadUrl").asString()))
				.method(intent.get("method").asString(), HttpRequest.BodyPublishers.ofByteArray(bytes));
		intent.get("headers").properties().forEach(header -> {
			if (!RESTRICTED_HEADERS.contains(header.getKey().toLowerCase())) {
				request.header(header.getKey(), header.getValue().asString());
			}
		});
		return http.send(request.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
	}

	private String objectKey(UUID assetId) {
		return jdbcTemplate.queryForObject("select object_key from assets where id = ?", String.class, assetId);
	}

	private UUID insertUser() {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, '실제S3', true, now(), now())""", id);
		return id;
	}

}
