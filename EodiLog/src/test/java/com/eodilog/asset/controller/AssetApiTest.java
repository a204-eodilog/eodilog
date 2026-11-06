package com.eodilog.asset.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.global.storage.InMemoryObjectStorage;
import com.eodilog.global.storage.InMemoryStorageConfiguration;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 저장소는 메모리 구현으로 바꿔 끼우고, 테스트가 put으로 앱의 직접 업로드를 흉내 낸다
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, InMemoryStorageConfiguration.class})
class AssetApiTest {

	private static final byte[] PNG = realImage("png");
	private static final byte[] JPEG = realImage("jpeg");
	private static final byte[] HEIC = heicFixture();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	@Autowired
	private InMemoryObjectStorage storage;

	private UUID ownerId;
	private UUID strangerId;

	@BeforeEach
	void setUp() {
		ownerId = insertUser("업로더");
		strangerId = insertUser("남");
	}

	@Test
	void uploadsCompletesAndDownloadsProfileImage() throws Exception {
		JsonNode intent = data(intent(ownerId, "{\"purpose\":\"PROFILE\",\"contentType\":\"image/png\",\"byteSize\":2048}")
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.method").value("PUT"))
				.andExpect(jsonPath("$.data.headers.content-type").value("image/png"))
				.andExpect(jsonPath("$.data.uploadUrl").value(containsString("uploads/")))
				.andExpect(jsonPath("$.data.expiresAt").exists()));
		UUID assetId = UUID.fromString(intent.get("assetId").asString());
		assertThat(assetStatus(assetId)).isEqualTo("PENDING");

		storage.put(objectKey(assetId), PNG, "image/png");
		complete(ownerId, assetId).andExpect(status().isOk())
				.andExpect(jsonPath("$.data.id").value(assetId.toString()))
				.andExpect(jsonPath("$.data.purpose").value("PROFILE"))
				.andExpect(jsonPath("$.data.status").value("READY"))
				.andExpect(jsonPath("$.data.contentType").value("image/png"))
				.andExpect(jsonPath("$.data.byteSize").value(2048))
				.andExpect(jsonPath("$.data.tripId").isEmpty());
		// 재시도해도 그대로 200
		complete(ownerId, assetId).andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("READY"));

		byte[] body = download(ownerId, assetId).andExpect(status().isOk())
				.andExpect(content().contentType("image/png"))
				.andExpect(header().string("Content-Length", Integer.toString(cleanPng().length)))
				.andExpect(header().string("Cache-Control", containsString("no-store")))
				.andExpect(header().string("Cache-Control", containsString("private")))
				.andExpect(header().string("X-Content-Type-Options", "nosniff"))
				.andReturn().getResponse().getContentAsByteArray();
		assertThat(body).isEqualTo(cleanPng());
		// 프로필은 다른 로그인 사용자도 받는다
		download(strangerId, assetId).andExpect(status().isOk());
		// 확인을 마친 파일은 취소할 수 없다
		cancel(ownerId, assetId).andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("ASSET_NOT_PENDING"));
	}

	@Test
	void rejectsInvalidIntentRequests() throws Exception {
		expectInvalid(intent(ownerId, "{}"), "purpose");
		expectInvalid(intent(ownerId, "{\"purpose\":\"PROFILE\",\"contentType\":\"image/gif\",\"byteSize\":10}"),
				"contentType");
		// 캡처·프로필은 HEIC를 받지 않는다
		expectInvalid(intent(ownerId, "{\"purpose\":\"CAPTURE\",\"contentType\":\"image/heic\",\"byteSize\":10}"),
				"contentType");
		expectInvalid(intent(ownerId, "{\"purpose\":\"CAPTURE\",\"contentType\":\"image/png\",\"byteSize\":0}"),
				"byteSize");
		expectInvalid(intent(ownerId,
				"{\"purpose\":\"CAPTURE\",\"contentType\":\"image/png\",\"byteSize\":15728641}"), "byteSize");
		expectInvalid(intent(ownerId, "{\"purpose\":\"PROFILE\",\"contentType\":\"image/png\",\"byteSize\":10,\"tripId\":\""
				+ UUID.randomUUID() + "\"}"), "tripId");
		expectInvalid(intent(ownerId, "{\"purpose\":\"TRIP_PHOTO\",\"contentType\":\"image/png\",\"byteSize\":10}"),
				"tripId");
		expectInvalid(intent(ownerId, "{\"purpose\":\"CAPTURE\",\"contentType\":\"image/png\",\"byteSize\":10,\"batchId\":\""
				+ UUID.randomUUID() + "\"}"), "batchId");
		// 상한 15MB 정각은 받는다
		intent(ownerId, "{\"purpose\":\"CAPTURE\",\"contentType\":\"image/png\",\"byteSize\":15728640}")
				.andExpect(status().isCreated());
		// 명세에 없는 필드·잘못된 용도
		intent(ownerId, "{\"purpose\":\"CAPTURE\",\"contentType\":\"image/png\",\"byteSize\":10,\"fileName\":\"a.png\"}")
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
		intent(ownerId, "{\"purpose\":\"VIDEO\",\"contentType\":\"image/png\",\"byteSize\":10}")
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
		assertThat(count("select count(*) from assets where owner_user_id = ?", ownerId)).isEqualTo(1);
	}

	@Test
	void tripPhotoIsLimitedToActiveMembers() throws Exception {
		UUID memberId = insertUser("동행");
		UUID tripId = createTrip(ownerId);
		insertActiveMember(tripId, memberId, 2);
		String body = "{\"purpose\":\"TRIP_PHOTO\",\"tripId\":\"" + tripId
				+ "\",\"contentType\":\"image/heic\",\"byteSize\":" + HEIC.length + "}";

		intent(strangerId, body).andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
		intent(ownerId, "{\"purpose\":\"TRIP_PHOTO\",\"tripId\":\"" + UUID.randomUUID()
				+ "\",\"contentType\":\"image/heic\",\"byteSize\":2048}").andExpect(status().isNotFound());

		UUID assetId = assetId(intent(ownerId, body).andExpect(status().isCreated()));
		assertThat(objectKey(assetId)).startsWith("uploads/");
		storage.put(objectKey(assetId), HEIC, "image/heic");
		complete(ownerId, assetId).andExpect(status().isOk())
				.andExpect(jsonPath("$.data.tripId").value(tripId.toString()));

		download(memberId, assetId).andExpect(status().isOk()).andExpect(content().contentType("image/jpeg"));
		expectAssetNotFound(download(strangerId, assetId));

		// 나간 멤버는 더 받지 못한다
		jdbcTemplate.update("update trip_members set status = 'LEFT', left_at = now() where trip_id = ? and user_id = ?", tripId, memberId);
		expectAssetNotFound(download(memberId, assetId));
	}

	@Test
	void completeChecksUploadOwnershipAndRealFormat() throws Exception {
		UUID assetId = assetId(intent(ownerId, "{\"purpose\":\"CAPTURE\",\"contentType\":\"image/png\",\"byteSize\":2048}"));

		// 남의 파일은 없는 파일과 같다
		expectAssetNotFound(complete(strangerId, assetId));
		expectAssetNotFound(complete(ownerId, UUID.randomUUID()));
		// 아직 올리지 않았다
		complete(ownerId, assetId).andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("UPLOAD_NOT_FOUND"));

		// PNG라고 해 놓고 JPEG를 올렸다: 올린 파일을 지우고 PENDING 유지
		storage.put(objectKey(assetId), JPEG, "image/png");
		expectMismatch(complete(ownerId, assetId));
		assertThat(storage.contains(objectKey(assetId))).isFalse();
		assertThat(assetStatus(assetId)).isEqualTo("PENDING");

		// 크기가 다르다
		storage.put(objectKey(assetId), withPadding(PNG, 65), "image/png");
		expectMismatch(complete(ownerId, assetId));

		// 이미지가 아니다
		storage.put(objectKey(assetId), withPadding("<html>".getBytes(StandardCharsets.US_ASCII), 64), "image/png");
		expectMismatch(complete(ownerId, assetId));

		// 같은 URL로 제대로 다시 올리면 된다
		storage.put(objectKey(assetId), PNG, "image/png");
		complete(ownerId, assetId).andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("READY"));

		// 캡처는 올린 사람만 받는다. 확인 전 파일은 주인도 받지 못한다
		download(ownerId, assetId).andExpect(status().isOk());
		expectAssetNotFound(download(strangerId, assetId));
		UUID pendingId = assetId(intent(ownerId, "{\"purpose\":\"CAPTURE\",\"contentType\":\"image/png\",\"byteSize\":2048}"));
		expectAssetNotFound(download(ownerId, pendingId));
	}

	@Test
	void cancelsPendingUploadAndBlocksLaterComplete() throws Exception {
		UUID assetId = assetId(intent(ownerId, "{\"purpose\":\"CAPTURE\",\"contentType\":\"image/jpeg\",\"byteSize\":2048}"));
		storage.put(objectKey(assetId), JPEG, "image/jpeg");

		expectAssetNotFound(cancel(strangerId, assetId));
		cancel(ownerId, assetId).andExpect(status().isNoContent());
		assertThat(assetStatus(assetId)).isEqualTo("CANCELLED");
		assertThat(storage.contains(objectKey(assetId))).isFalse();
		// 다시 취소해도 204
		cancel(ownerId, assetId).andExpect(status().isNoContent());

		// 취소 뒤 complete는 거부
		storage.put(objectKey(assetId), JPEG, "image/jpeg");
		complete(ownerId, assetId).andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("ASSET_NOT_PENDING"));
		expectAssetNotFound(download(ownerId, assetId));
	}

	private ResultActions intent(UUID userId, String body) throws Exception {
		return mockMvc.perform(post("/api/v1/assets/upload-intents").with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private ResultActions complete(UUID userId, UUID assetId) throws Exception {
		return mockMvc.perform(post("/api/v1/assets/{assetId}/complete", assetId).with(authUser(userId)));
	}

	private ResultActions cancel(UUID userId, UUID assetId) throws Exception {
		return mockMvc.perform(delete("/api/v1/assets/{assetId}", assetId).with(authUser(userId)));
	}

	private ResultActions download(UUID userId, UUID assetId) throws Exception {
		return mockMvc.perform(get("/api/v1/assets/{assetId}/download", assetId).with(authUser(userId)));
	}

	private void expectInvalid(ResultActions result, String field) throws Exception {
		result.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields[*].field").value(hasItem(field)));
	}

	private void expectAssetNotFound(ResultActions result) throws Exception {
		result.andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("ASSET_NOT_FOUND"));
	}

	private void expectMismatch(ResultActions result) throws Exception {
		result.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.error.code").value("UPLOAD_MISMATCH"));
	}

	private UUID assetId(ResultActions result) throws Exception {
		return UUID.fromString(data(result).get("assetId").asString());
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

	private String objectKey(UUID assetId) {
		return jdbcTemplate.queryForObject("select object_key from assets where id = ?", String.class, assetId);
	}

	private String assetStatus(UUID assetId) {
		return jdbcTemplate.queryForObject("select status from assets where id = ?", String.class, assetId);
	}

	private long count(String sql, Object... args) {
		return jdbcTemplate.queryForObject(sql, Long.class, args);
	}

	private UUID createTrip(UUID userId) throws Exception {
		return UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(userId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"title\":\"제주\"}"))
				.andExpect(status().isCreated())).get("id").asString());
	}

	private UUID insertUser(String nickname) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, ?, true, now(), now())""", id, nickname);
		return id;
	}

	private void insertActiveMember(UUID tripId, UUID userId, long joinOrder) {
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at)
				values (?, ?, ?, 'ACTIVE', ?, now())""", UUID.randomUUID(), tripId, userId, joinOrder);
	}

	    private static byte[] realImage(String format) {
        try {
            var out = new java.io.ByteArrayOutputStream();
            javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(8, 6, java.awt.image.BufferedImage.TYPE_INT_RGB), format, out);
            return Arrays.copyOf(out.toByteArray(), 2048);
        } catch (Exception ex) { throw new IllegalStateException(ex); }
    }
    private static byte[] cleanPng() {
        return new com.eodilog.asset.ImageSanitizer(new com.eodilog.asset.AssetProperties()).sanitize(PNG,"image/png").bytes();
    }
    private static byte[] heicFixture() {
        try (var input = AssetApiTest.class.getResourceAsStream("/images/example.heic")) { return input.readAllBytes(); }
        catch (Exception ex) { throw new IllegalStateException(ex); }
    }
private static byte[] withPadding(byte[] head, int size) {
		return Arrays.copyOf(head, size);
	}

	// ftyp 상자: 크기 24, 주 브랜드 heic, 호환 브랜드 mif1·heic
	private static byte[] heicHead() {
		byte[] bytes = new byte[24];
		bytes[3] = 24;
		System.arraycopy("ftypheic".getBytes(StandardCharsets.US_ASCII), 0, bytes, 4, 8);
		System.arraycopy("mif1heic".getBytes(StandardCharsets.US_ASCII), 0, bytes, 16, 8);
		return bytes;
	}

}
