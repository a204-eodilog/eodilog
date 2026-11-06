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

}
