package com.eodilog.global.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.headerDoesNotExist;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.net.SocketTimeoutException;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 내부 AI 호출의 헤더와 실패 분류(AI spec §1.0): 5xx·연결 실패·타임아웃은 재시도, 4xx·형식 오류는 재시도하지 않는다
class HttpAiServerClientTest {

	private static final String BASE_URL = "http://ai.test";
	private static final UUID JOB_ID = UUID.fromString("019a0000-0000-7000-8000-000000000001");

	private final JsonMapper jsonMapper = JsonMapper.builder().build();

	@Test
	void sendsTokenAndTraceIdAndUnwrapsData() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo(BASE_URL + "/ai/v1/checklist-suggestions"))
				.andExpect(method(HttpMethod.POST))
				.andExpect(header("X-Internal-Token", "secret-token"))
				.andExpect(header("X-Trace-Id", JOB_ID.toString()))
				// 한글 장소 이름이 깨지지 않고 UTF-8로 나간다
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
				.andExpect(content().bytes(("{\"jobId\":\"" + JOB_ID + "\",\"name\":\"해운대\"}")
						.getBytes(java.nio.charset.StandardCharsets.UTF_8)))
				.andRespond(withSuccess("{\"data\":{\"items\":[]}}", MediaType.APPLICATION_JSON));

		JsonNode data = client(builder, "secret-token").post("/ai/v1/checklist-suggestions", JOB_ID, body());

		assertThat(data.get("items").isArray()).isTrue();
		server.verify();
	}

	@Test
	void omitsTokenHeaderWhenNotConfigured() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo(BASE_URL + "/ai/v1/checklist-suggestions"))
				.andExpect(headerDoesNotExist("X-Internal-Token"))
				.andRespond(withStatus(HttpStatus.UNAUTHORIZED));

		expectFailure(client(builder, "  "), false);
		server.verify();
	}

	@Test
	void classifiesFailures() {
		expectFailure(respondingWith(builder -> withServerError()), true);
		expectFailure(respondingWith(builder -> withStatus(HttpStatus.SERVICE_UNAVAILABLE)), true);
		expectFailure(respondingWith(builder -> withException(new SocketTimeoutException("read timed out"))), true);
		expectFailure(respondingWith(builder -> withException(new IOException("connection refused"))), true);
		expectFailure(respondingWith(builder -> withStatus(HttpStatus.UNPROCESSABLE_CONTENT)), false);
		expectFailure(respondingWith(builder -> withStatus(HttpStatus.BAD_REQUEST)), false);
		expectFailure(respondingWith(builder -> withSuccess("{\"items\":[]}", MediaType.APPLICATION_JSON)), false);
		expectFailure(respondingWith(builder -> withSuccess("{\"data\":[]}", MediaType.APPLICATION_JSON)), false);
		expectFailure(respondingWith(builder -> withSuccess("not json", MediaType.APPLICATION_JSON)), false);
	}

	@Test
	void keepsOnlyKnownProviderErrorCodeAndTimeoutClassification() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo(BASE_URL + "/ai/v1/checklist-suggestions"))
				.andRespond(withStatus(HttpStatus.UNPROCESSABLE_CONTENT).contentType(MediaType.APPLICATION_JSON)
						.body("{\"error\":{\"code\":\"INSUFFICIENT_DATA\",\"message\":\"private transcript\"}}"));
		assertThatThrownBy(() -> client(builder,"secret").post("/ai/v1/checklist-suggestions",JOB_ID,body()))
				.isInstanceOfSatisfying(AiServerException.class,ex -> {
					assertThat(ex.status()).isEqualTo(422);
					assertThat(ex.providerCode()).isEqualTo("INSUFFICIENT_DATA");
					assertThat(ex.getMessage()).doesNotContain("private transcript");
				});
		server.verify();
		assertThat(new AiServerException(400,"private text").providerCode()).isNull();
		assertThatThrownBy(() -> respondingWith(b -> withException(new SocketTimeoutException("private timeout")))
				.post("/ai/v1/checklist-suggestions",JOB_ID,body()))
				.isInstanceOfSatisfying(AiServerException.class,ex -> assertThat(ex.timedOut()).isTrue());
	}

	@Test
	void sendsMultipartFieldsAndFilesInUtf8() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		byte[] png = {(byte) 0x89, 'P', 'N', 'G', 1, 2, 3};
		server.expect(requestTo(BASE_URL + "/ai/v1/place-extractions"))
				.andExpect(method(HttpMethod.POST))
				.andExpect(header("X-Internal-Token", "secret-token"))
				.andExpect(header("X-Trace-Id", JOB_ID.toString()))
				.andExpect(content().contentTypeCompatibleWith(MediaType.MULTIPART_FORM_DATA))
				.andExpect(request -> {
					byte[] sent = ((org.springframework.mock.http.client.MockClientHttpRequest) request).getBodyAsBytes();
					String text = new String(sent, java.nio.charset.StandardCharsets.UTF_8);
					// 한글 메모가 UTF-8 바이트 그대로 나가고, 값이 null인 필드는 빠진다
					assertThat(text).contains("name=\"memo\"").contains("부산 해운대 카페")
							.contains("name=\"url\"").contains("https://example.com/p/1")
							.doesNotContain("name=\"regionHint\"")
							.contains("name=\"captures\"; filename=\"capture-1.png\"")
							.contains("name=\"captures\"; filename=\"capture-2.jpg\"")
							.contains("Content-Type: image/png").contains("Content-Type: image/jpeg");
					assertThat(indexOf(sent, png)).isNotNegative();
				})
				.andRespond(withSuccess("{\"data\":{\"resultStatus\":\"NOT_FOUND\",\"candidates\":[]}}",
						MediaType.APPLICATION_JSON));

		java.util.Map<String, String> fields = new java.util.LinkedHashMap<>();
		fields.put("url", "https://example.com/p/1");
		fields.put("memo", "부산 해운대 카페");
		fields.put("regionHint", null);
		JsonNode data = client(builder, "secret-token").postMultipart("/ai/v1/place-extractions", JOB_ID, fields,
				java.util.List.of(new AiServerClient.FilePart("captures", "capture-1.png", "image/png", png),
						new AiServerClient.FilePart("captures", "capture-2.jpg", "image/jpeg", new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF})));

		assertThat(data.get("resultStatus").asString()).isEqualTo("NOT_FOUND");
		server.verify();
	}

	@Test
	void classifiesMultipartFailuresLikeJson() {
		for (var expectation : java.util.List.of(
				java.util.Map.entry(withStatus(HttpStatus.SERVICE_UNAVAILABLE), true),
				java.util.Map.entry(withException(new SocketTimeoutException("read timed out")), true),
				java.util.Map.entry(withStatus(HttpStatus.UNPROCESSABLE_CONTENT), false),
				java.util.Map.entry(withSuccess("{\"data\":[]}", MediaType.APPLICATION_JSON), false))) {
			RestClient.Builder builder = RestClient.builder();
			MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
			server.expect(requestTo(BASE_URL + "/ai/v1/place-extractions")).andRespond(expectation.getKey());
			AiServerClient client = client(builder, "secret-token");
			assertThatThrownBy(() -> client.postMultipart("/ai/v1/place-extractions", JOB_ID,
					java.util.Map.of("url", "https://example.com"), java.util.List.of()))
					.isInstanceOfSatisfying(AiServerException.class,
							ex -> assertThat(ex.retryable()).isEqualTo(expectation.getValue()));
		}
	}

	private static int indexOf(byte[] source, byte[] target) {
		outer:
		for (int i = 0; i <= source.length - target.length; i++) {
			for (int j = 0; j < target.length; j++) {
				if (source[i + j] != target[j]) {
					continue outer;
				}
			}
			return i;
		}
		return -1;
	}

	private AiServerClient respondingWith(
			java.util.function.Function<RestClient.Builder, org.springframework.test.web.client.ResponseCreator> response) {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo(BASE_URL + "/ai/v1/checklist-suggestions")).andRespond(response.apply(builder));
		return client(builder, "secret-token");
	}

	private void expectFailure(AiServerClient client, boolean retryable) {
		assertThatThrownBy(() -> client.post("/ai/v1/checklist-suggestions", JOB_ID, body()))
				.isInstanceOfSatisfying(AiServerException.class, ex -> assertThat(ex.retryable()).isEqualTo(retryable));
	}

	private AiServerClient client(RestClient.Builder builder, String token) {
		AiServerProperties properties = new AiServerProperties(BASE_URL, token, Duration.ofSeconds(5),
				Duration.ofSeconds(50));
		return new HttpAiServerClient(properties, jsonMapper, builder);
	}

	private JsonNode body() {
		return jsonMapper.createObjectNode().put("jobId", JOB_ID.toString()).put("name", "해운대");
	}

	@Test
	void multipartClassifiesHttpConnectionReadAndMalformedResponseFailures() {
		java.util.List<org.springframework.test.web.client.ResponseCreator> responses=java.util.List.of(
				withServerError(),withStatus(HttpStatus.SERVICE_UNAVAILABLE),
				withException(new java.net.ConnectException("provider-private-connect")),
				withException(new SocketTimeoutException("provider-private-read")),
				withStatus(HttpStatus.BAD_REQUEST),withStatus(HttpStatus.UNPROCESSABLE_CONTENT),
				withSuccess("not json",MediaType.APPLICATION_JSON),
				withSuccess("{}",MediaType.APPLICATION_JSON),
				withSuccess("{\"data\":[]}",MediaType.APPLICATION_JSON),
				withSuccess("{\"data\":null}",MediaType.APPLICATION_JSON));
		for(int i=0;i<responses.size();i++) {
			RestClient.Builder builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();
			server.expect(requestTo(BASE_URL+"/ai/v1/photo-classifications")).andRespond(responses.get(i));
			boolean retryable=i<4;
			assertThatThrownBy(()->client(builder,"secret-token").postMultipart("/ai/v1/photo-classifications",JOB_ID,jsonMapper.createObjectNode(),java.util.List.of()))
					.isInstanceOfSatisfying(AiServerException.class,ex->assertThat(ex.retryable()).isEqualTo(retryable));
			server.verify();
		}
	}

	@Test
	void multipartUsesRealHttpWithRepeatedOrderedFilesAndSafeHeaders() throws Exception {
		var observed = new java.util.concurrent.CompletableFuture<String>();
		var server = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/ai/v1/photo-classifications", exchange -> {
			try {
				assertThat(exchange.getRequestHeaders().getFirst("X-Internal-Token")).isEqualTo("secret-token");
				assertThat(exchange.getRequestHeaders().getFirst("X-Trace-Id")).isEqualTo(JOB_ID.toString());
				assertThat(exchange.getRequestHeaders().getFirst("Content-Type")).startsWith("multipart/form-data;boundary=");
				observed.complete(new String(exchange.getRequestBody().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8));
				byte[] response="{\"data\":{\"photos\":[]}}".getBytes(java.nio.charset.StandardCharsets.UTF_8);
				exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(200,response.length);
				exchange.getResponseBody().write(response);
			} catch(Throwable failure) {observed.completeExceptionally(failure);exchange.sendResponseHeaders(500,-1);}
			finally {exchange.close();}
		});
		server.start();
		var first=java.nio.file.Files.createTempFile("multipart-first-",".png");
		var second=java.nio.file.Files.createTempFile("multipart-second-",".png");
		try {
			java.nio.file.Files.writeString(first,"first-display-pixels");java.nio.file.Files.writeString(second,"second-display-pixels");
			var client=new HttpAiServerClient(new AiServerProperties("http://127.0.0.1:"+server.getAddress().getPort(),"secret-token",Duration.ofSeconds(2),Duration.ofSeconds(5)),jsonMapper);
			var meta=jsonMapper.createObjectNode();meta.putArray("photoIds").add("first").add("second");
			assertThat(client.postMultipart("/ai/v1/photo-classifications",JOB_ID,meta,java.util.List.of(new AiServerClient.MultipartFile(first,"image/png"),new AiServerClient.MultipartFile(second,"image/png"))).path("photos").isArray()).isTrue();
			String wire=observed.get(5,java.util.concurrent.TimeUnit.SECONDS);
			assertThat(wire).contains("name=\"meta\"","{\"photoIds\":[\"first\",\"second\"]}","Content-Type: image/png");
			assertThat(wire.split("name=\"files\"",-1)).hasSize(3);
			assertThat(wire.indexOf("first-display-pixels")).isLessThan(wire.indexOf("second-display-pixels"));
		} finally {server.stop(0);java.nio.file.Files.deleteIfExists(first);java.nio.file.Files.deleteIfExists(second);}
	}

	@Test
	void sharedMultipartEncoderSupportsExtractionTextAndCaptureFieldNames() throws Exception {
		var observed=new java.util.concurrent.CompletableFuture<String>();
		var server=com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1",0),0);
		server.createContext("/ai/v1/place-extractions",exchange->{
			observed.complete(new String(exchange.getRequestBody().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8));
			byte[] response="{\"data\":{\"candidates\":[]}}".getBytes(java.nio.charset.StandardCharsets.UTF_8);
			exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(200,response.length);
			exchange.getResponseBody().write(response);exchange.close();
		});server.start();
		var file=java.nio.file.Files.createTempFile("capture-",".png");
		try {
			java.nio.file.Files.writeString(file,"capture-pixels");
			var client=new HttpAiServerClient(new AiServerProperties("http://127.0.0.1:"+server.getAddress().getPort(),"",Duration.ofSeconds(2),Duration.ofSeconds(5)),jsonMapper);
			client.postMultipart("/ai/v1/place-extractions",JOB_ID,java.util.Map.of("url","https://example.test/place","memo","해운대 메모","regionHint","부산"),"captures",java.util.List.of(new AiServerClient.MultipartFile(file,"image/png")));
			assertThat(observed.get(5,java.util.concurrent.TimeUnit.SECONDS)).contains("name=\"url\"","https://example.test/place","name=\"memo\"","해운대 메모","name=\"regionHint\"","부산","name=\"captures\"","capture-pixels");
		} finally {server.stop(0);java.nio.file.Files.deleteIfExists(file);}
	}

	@Test
	void bExtractionFilePartContractKeepsUtf8FilenameAndOmitsNullFields() throws Exception {
		var observed=new java.util.concurrent.CompletableFuture<String>();
		var server=com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1",0),0);
		server.createContext("/ai/v1/place-extractions",exchange->{
			observed.complete(new String(exchange.getRequestBody().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8));
			byte[] response="{\"data\":{\"candidates\":[]}}".getBytes(java.nio.charset.StandardCharsets.UTF_8);
			exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(200,response.length);
			exchange.getResponseBody().write(response);exchange.close();
		});server.start();
		try {
			var fields=new java.util.HashMap<String,String>();fields.put("memo","부산 카페");fields.put("url",null);
			var client=new HttpAiServerClient(new AiServerProperties("http://127.0.0.1:"+server.getAddress().getPort(),"",Duration.ofSeconds(2),Duration.ofSeconds(5)),jsonMapper);
			client.postMultipart("/ai/v1/place-extractions",JOB_ID,fields,java.util.List.of(
					new AiServerClient.FilePart("captures","capture.png","image/png","capture-bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8))));
			assertThat(observed.get(5,java.util.concurrent.TimeUnit.SECONDS)).contains("부산 카페","name=\"captures\"","filename=\"capture.png\"","capture-bytes")
					.doesNotContain("name=\"url\"");
		} finally {server.stop(0);}
	}

}
