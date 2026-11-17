package com.eodilog.voicetrip;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.eodilog.global.ai.AiServerProperties;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

// 말로 여행 만들기: 내부 토큰을 붙여 넘기고, AI 4xx 중 보여 줄 것만 그대로, 나머지는 503으로 바꾼다
class VoiceTripAiClientTest {

	private static final String BASE_URL = "http://ai.test";

	private final RestClient.Builder builder = RestClient.builder();
	private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
	private final VoiceTripAiClient client = new VoiceTripAiClient(
			new AiServerProperties(BASE_URL, "secret", Duration.ofSeconds(5), Duration.ofSeconds(50)),
			JsonMapper.builder().build(), builder);

	@Test
	void startJobSendsTextWithTokenAndReturnsBodyAsIs() {
		String body = "{\"data\":{\"jobId\":\"0123456789abcdef0123456789abcdef\",\"status\":\"RUNNING\"}}";
		server.expect(requestTo(BASE_URL + "/ai/v1/voice-trip/jobs"))
				.andExpect(method(HttpMethod.POST))
				.andExpect(header("X-Internal-Token", "secret"))
				.andExpect(content().string(org.hamcrest.Matchers.containsString("부산 가려고")))
				.andRespond(withStatus(HttpStatus.ACCEPTED).contentType(MediaType.APPLICATION_JSON)
						.body(body.getBytes(StandardCharsets.UTF_8)));

		byte[] got = client.startJob("부산 가려고", null);

		assertThat(new String(got, StandardCharsets.UTF_8)).isEqualTo(body);
		assertThat(client.jobId(got)).isEqualTo("0123456789abcdef0123456789abcdef");
		server.verify();
	}

	@Test
	void getJobUsesGet() {
		server.expect(requestTo(BASE_URL + "/ai/v1/voice-trip/jobs/abc"))
				.andExpect(method(HttpMethod.GET))
				.andRespond(withSuccess("{\"data\":{}}", MediaType.APPLICATION_JSON));
		client.getJob("abc");
		server.verify();
	}

	@Test
	void passesUserFacingErrors() {
		server.expect(requestTo(BASE_URL + "/ai/v1/voice-trip/fixes"))
				.andRespond(withStatus(HttpStatus.UNPROCESSABLE_ENTITY).contentType(MediaType.APPLICATION_JSON)
						.body("{\"error\":{\"code\":\"INSUFFICIENT_DATA\",\"message\":\"말소리를 듣지 못했어요.\"}}"
								.getBytes(StandardCharsets.UTF_8)));

		assertThatThrownBy(() -> client.fix("{}", "x", null))
				.isInstanceOfSatisfying(BusinessException.class, e -> {
					assertThat(e.getErrorCode()).isEqualTo(VoiceTripError.INSUFFICIENT_DATA);
					assertThat(e.getMessage()).isEqualTo("말소리를 듣지 못했어요.");
				});
	}

	@Test
	void hidesTokenAndServerFailures() {
		assertThat(client.toBusiness(401, null).getErrorCode()).isEqualTo(VoiceTripError.AI_UNAVAILABLE);
		assertThat(client.toBusiness(502, "{\"error\":{\"message\":\"내부\"}}".getBytes(StandardCharsets.UTF_8))
				.getErrorCode()).isEqualTo(VoiceTripError.AI_UNAVAILABLE);
		assertThat(client.toBusiness(404, null).getErrorCode()).isEqualTo(CommonErrorCode.NOT_FOUND);
	}

	@Test
	void jobIdMissingIsUnavailable() {
		assertThatThrownBy(() -> client.jobId("{\"data\":{}}".getBytes(StandardCharsets.UTF_8)))
				.isInstanceOf(BusinessException.class);
	}

}
