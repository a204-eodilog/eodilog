package com.eodilog.voicetrip;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.eodilog.global.ai.AiServerProperties;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.security.AuthUser;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

// 컨트롤러가 로그인·만든 사람·입력 크기를 확인하고 AI 서버로 넘기는지 본다(DB 없이)
class VoiceTripControllerTest {

	private static final String JOB = "0123456789abcdef0123456789abcdef";
	private static final String JOB_BODY = "{\"data\":{\"jobId\":\"" + JOB + "\",\"status\":\"RUNNING\"}}";

	private final RestClient.Builder builder = RestClient.builder();
	private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
	private final VoiceTripController controller = new VoiceTripController(
			new VoiceTripAiClient(new AiServerProperties("http://ai.test", "t", Duration.ofSeconds(5),
					Duration.ofSeconds(50)), JsonMapper.builder().build(), builder),
			new VoiceTripJobOwners(Clock.systemUTC()));
	private final AuthUser me = new AuthUser(UUID.randomUUID());

	@Test
	void startsWithAudioAndOnlyTheMakerCanRead() {
		server.expect(requestTo("http://ai.test/ai/v1/voice-trip/jobs"))
				.andExpect(content().string(Matchers.containsString("filename=\"trip.m4a\"")))
				.andRespond(withStatus(HttpStatus.ACCEPTED).contentType(MediaType.APPLICATION_JSON).body(JOB_BODY));
		server.expect(requestTo("http://ai.test/ai/v1/voice-trip/jobs/" + JOB))
				.andRespond(withSuccess("{\"data\":{\"jobId\":\"" + JOB + "\"}}", MediaType.APPLICATION_JSON));

		var started = controller.start(me, new MockMultipartFile("audio", "trip.m4a", "audio/mp4", new byte[] {1, 2}), null);
		assertThat(started.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
		assertThat(new String(started.getBody(), StandardCharsets.UTF_8)).isEqualTo(JOB_BODY);

		assertThat(controller.job(me, JOB).getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThatThrownBy(() -> controller.job(new AuthUser(UUID.randomUUID()), JOB))
				.isInstanceOfSatisfying(BusinessException.class,
						e -> assertThat(e.getErrorCode()).isEqualTo(CommonErrorCode.NOT_FOUND));
		assertThatThrownBy(() -> controller.job(me, "../health"))
				.isInstanceOf(BusinessException.class);
		server.verify();
	}

	@Test
	void needsLoginAndSomethingToSay() {
		assertThatThrownBy(() -> controller.start(null, null, "부산"))
				.isInstanceOfSatisfying(BusinessException.class,
						e -> assertThat(e.getErrorCode()).isEqualTo(CommonErrorCode.UNAUTHENTICATED));
		assertThatThrownBy(() -> controller.start(me, null, "  "))
				.isInstanceOfSatisfying(BusinessException.class,
						e -> assertThat(e.getErrorCode()).isEqualTo(CommonErrorCode.VALIDATION_ERROR));
		assertThatThrownBy(() -> controller.fix(me, "{}", null, "x".repeat(501)))
				.isInstanceOf(BusinessException.class);
		assertThatThrownBy(() -> controller.candidates(me, new byte[5000]))
				.isInstanceOf(BusinessException.class);
	}

}
