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

// 실제 S3 개발 버킷 왕복 확인. 기본 빌드에서는 건너뛰고 `gradlew test --tests "*AssetRealS3Test" -PrealS3=true`로만 돈다
// EodiLog/.env의 STORAGE_BUCKET·STORAGE_REGION·AWS 키를 쓰고, 만든 객체는 끝에 지운다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIfSystemProperty(named = "eodilog.realS3", matches = "true")
class AssetRealS3Test {

	// HttpClient가 직접 정하는 헤더. 서명 URL 헤더 중 이것들은 넣지 않아도 같은 값이 나간다
	private static final Set<String> RESTRICTED_HEADERS = Set.of("content-length", "host");
	private static final byte[] PNG = realPng();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	@Autowired
	private ObjectStorage objectStorage;

	@Autowired
	private com.eodilog.job.JobWorker jobWorker;

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
		if (System.getenv("PHOTO_AI_REAL_URL") != null) {
			registry.add("app.ai.base-url", () -> System.getenv("PHOTO_AI_REAL_URL"));
			registry.add("app.ai.internal-token", () -> System.getenv("PHOTO_AI_REAL_TOKEN"));
		}
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
			assertThat(javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(body)).getWidth()).isEqualTo(8);
		} finally {
			objectStorage.delete(key);
            objectStorage.delete("display/"+assetId);
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
            objectStorage.delete("display/"+assetId);
		}
	}

	private JsonNode createIntent(UUID userId) throws Exception {
		String response = mockMvc.perform(post("/api/v1/assets/upload-intents").with(authUser(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"purpose\":\"CAPTURE\",\"contentType\":\"image/png\",\"byteSize\":" + PNG.length + "}"))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		return jsonMapper.readTree(response).get("data");
	}

	@Test
	void photoDeleteApiRemovesOriginalAndDisplayFromRealS3() throws Exception {
		assertThat(objectStorage).isInstanceOf(com.eodilog.global.storage.S3ObjectStorage.class);
		UUID userId = insertUser();
		JsonNode trip = responseData(mockMvc.perform(post("/api/v1/trips").with(authUser(userId))
				.header("Idempotency-Key", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"title\":\"실제 S3 사진 삭제 검증\"}"))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
		String tripId = trip.path("id").asString();
		JsonNode batch = responseData(mockMvc.perform(post("/api/v1/trips/{tripId}/photo-upload-batches", tripId)
				.with(authUser(userId)).header("Idempotency-Key", UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON).content("{\"fileCount\":1}"))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
		String batchId = batch.path("id").asString();
		JsonNode intent = responseData(mockMvc.perform(post("/api/v1/assets/upload-intents").with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"purpose\":\"TRIP_PHOTO\",\"tripId\":\"%s\",\"batchId\":\"%s\",\"contentType\":\"image/png\",\"byteSize\":%d}"
						.formatted(tripId, batchId, PNG.length)))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
		UUID assetId = UUID.fromString(intent.path("assetId").asString());
		String key = objectKey(assetId);
		String displayKey = jdbcTemplate.queryForObject("select display_key from assets where id=?", String.class, assetId);
		try {
			assertThat(put(intent, PNG)).isEqualTo(200);
			mockMvc.perform(post("/api/v1/assets/{id}/complete", assetId).with(authUser(userId))).andExpect(status().isOk());
			JsonNode photo = responseData(mockMvc.perform(post("/api/v1/trips/{tripId}/photos", tripId).with(authUser(userId))
					.contentType(MediaType.APPLICATION_JSON).content("{\"batchId\":\"%s\",\"assetId\":\"%s\"}".formatted(batchId, assetId)))
					.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
			String photoId = photo.path("id").asString();
			assertThat(objectStorage.head(key)).isPresent();
			assertThat(objectStorage.head(displayKey)).isPresent();
			mockMvc.perform(get("/api/v1/assets/{id}/download", assetId).with(authUser(userId))).andExpect(status().isOk());
			JsonNode deletion = responseData(mockMvc.perform(delete("/api/v1/trips/{tripId}/photos/{photoId}", tripId, photoId)
					.with(authUser(userId))).andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString());
			UUID jobId = UUID.fromString(deletion.path("jobId").asString());
			mockMvc.perform(get("/api/v1/assets/{id}/download", assetId).with(authUser(userId))).andExpect(status().isNotFound());
			long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(60);
			String jobStatus;
			do {
				jobWorker.pollOnce();
				jobStatus = jdbcTemplate.queryForObject("select status from jobs where id=?", String.class, jobId);
				if (Set.of("SUCCEEDED", "FAILED", "CANCELLED").contains(jobStatus)) break;
				Thread.sleep(100);
			} while (System.nanoTime() < deadline);
			assertThat(jobStatus).isEqualTo("SUCCEEDED");
			// finally의 안전 정리 전에 실제 삭제 API/worker가 두 객체를 없앴는지 검증한다.
			assertThat(objectStorage.head(key)).isEmpty();
			assertThat(objectStorage.head(displayKey)).isEmpty();
			mockMvc.perform(get("/api/v1/jobs/{id}", jobId).with(authUser(userId)))
					.andExpect(status().isOk()).andExpect(jsonPath("$.data.result.scope").value("PHOTO_DELETE"))
					.andExpect(jsonPath("$.data.result.completedCount").value(1));
			mockMvc.perform(delete("/api/v1/trips/{tripId}/photos/{photoId}", tripId, photoId).with(authUser(userId)))
					.andExpect(status().isAccepted()).andExpect(jsonPath("$.data.jobId").value(jobId.toString()));
		} finally {
			try { objectStorage.delete(key); }
			finally { objectStorage.delete(displayKey); }
		}
	}

	private JsonNode responseData(String response) {
		return jsonMapper.readTree(response).path("data");
	}

	@Test
	@EnabledIfEnvironmentVariable(named = "PHOTO_AI_REAL_URL", matches = ".+")
	void realS3PhotosClassifyWithRealModelAndApplySimilarGroup() throws Exception {
		assertThat(objectStorage).isInstanceOf(com.eodilog.global.storage.S3ObjectStorage.class);
		UUID userId = insertUser();
		String tripId = responseData(mockMvc.perform(post("/api/v1/trips").with(authUser(userId))
				.header("Idempotency-Key", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"title\":\"실제 S3와 사진 AI 통합 검증\"}"))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString();
		String batchId = responseData(mockMvc.perform(post("/api/v1/trips/{trip}/photo-upload-batches", tripId)
				.with(authUser(userId)).header("Idempotency-Key", UUID.randomUUID().toString())
				.contentType(MediaType.APPLICATION_JSON).content("{\"fileCount\":2}"))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString();
		var assetIds = new java.util.ArrayList<UUID>();
		var photoIds = new java.util.ArrayList<String>();
		try {
			for (int index = 0; index < 2; index++) {
				JsonNode intent = responseData(mockMvc.perform(post("/api/v1/assets/upload-intents").with(authUser(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"purpose\":\"TRIP_PHOTO\",\"tripId\":\"%s\",\"batchId\":\"%s\",\"contentType\":\"image/png\",\"byteSize\":%d}"
								.formatted(tripId, batchId, PNG.length)))
						.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
				UUID assetId = UUID.fromString(intent.path("assetId").asString());
				assetIds.add(assetId);
				assertThat(put(intent, PNG)).isEqualTo(200);
				mockMvc.perform(post("/api/v1/assets/{id}/complete", assetId).with(authUser(userId))).andExpect(status().isOk());
				photoIds.add(responseData(mockMvc.perform(post("/api/v1/trips/{trip}/photos", tripId).with(authUser(userId))
						.contentType(MediaType.APPLICATION_JSON).content("{\"batchId\":\"%s\",\"assetId\":\"%s\"}".formatted(batchId, assetId)))
						.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString());
			}
			String jobId = responseData(mockMvc.perform(post("/api/v1/trips/{trip}/photo-classifications", tripId).with(authUser(userId))
					.header("Idempotency-Key", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON)
					.content(jsonMapper.writeValueAsString(java.util.Map.of("photoIds", photoIds))))
					.andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString()).path("jobId").asString();
			long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(65);
			String jobStatus;
			do {
				jobWorker.pollOnce();
				jobStatus = jdbcTemplate.queryForObject("select status from jobs where id=?", String.class, UUID.fromString(jobId));
				if (Set.of("SUCCEEDED", "FAILED", "CANCELLED").contains(jobStatus)) break;
				Thread.sleep(100);
			} while (System.nanoTime() < deadline);
			assertThat(jobStatus).isEqualTo("SUCCEEDED");
			JsonNode result = responseData(mockMvc.perform(get("/api/v1/jobs/{id}", jobId).with(authUser(userId)))
					.andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("result").path("photos");
			assertThat(result.size()).isEqualTo(2);
			for (JsonNode photo : result) {
				assertThat(photo.path("status").asString()).isEqualTo("SUCCEEDED");
				assertThat(photo.path("topics").size()).isEqualTo(1);
				assertThat(photo.path("groupId").isString()).isTrue();
			}
			assertThat(result.get(0).path("groupId")).isEqualTo(result.get(1).path("groupId"));
			String apply = jsonMapper.writeValueAsString(java.util.Map.of("expectedPhotoVersions",
					photoIds.stream().map(id -> java.util.Map.of("photoId", id, "version", 1)).toList()));
			mockMvc.perform(post("/api/v1/trips/{trip}/photo-classifications/{job}/apply", tripId, jobId)
					.with(authUser(userId)).contentType(MediaType.APPLICATION_JSON).content(apply))
					.andExpect(status().isOk()).andExpect(jsonPath("$.data.photos.length()").value(2));
			String groupId = jdbcTemplate.queryForObject("select group_id from photos where id=?", UUID.class,
					UUID.fromString(photoIds.getFirst())).toString();
			mockMvc.perform(get("/api/v1/trips/{trip}/photos", tripId).param("groupId", groupId).with(authUser(userId)))
					.andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(2));
			mockMvc.perform(get("/api/v1/trips/{trip}/photo-summary", tripId).with(authUser(userId)))
					.andExpect(status().isOk()).andExpect(jsonPath("$.data.groups[0].count").value(2));
			assertThat(jdbcTemplate.queryForObject("select count(*) from photo_topics t join photos p on p.id=t.photo_id where p.trip_id=? and t.source='AI'",
					Long.class, UUID.fromString(tripId))).isEqualTo(2L);
			mockMvc.perform(post("/api/v1/trips/{trip}/photo-classifications/{job}/apply", tripId, jobId)
					.with(authUser(userId)).contentType(MediaType.APPLICATION_JSON).content(apply)).andExpect(status().isOk());
			assertThat(jdbcTemplate.queryForObject("select count(*) from photos where trip_id=? and version=2", Long.class, UUID.fromString(tripId)))
					.isEqualTo(2L);
		} finally {
			for (UUID assetId : assetIds) {
				try { objectStorage.delete(objectKey(assetId)); }
				finally { objectStorage.delete("display/" + assetId); }
			}
		}
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

	private static byte[] realPng() {
        try {
            var out=new java.io.ByteArrayOutputStream();
            javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(8,6,java.awt.image.BufferedImage.TYPE_INT_RGB),"png",out);
            return out.toByteArray();
        } catch (Exception ex) {throw new IllegalStateException(ex);}
    }
    private UUID insertUser() {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, '실제S3', true, now(), now())""", id);
		return id;
	}

}
