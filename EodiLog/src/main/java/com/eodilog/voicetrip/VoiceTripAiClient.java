package com.eodilog.voicetrip;

import com.eodilog.global.ai.AiServerProperties;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorCode;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 말로 여행 만들기(실험): 앱 요청을 내부 AI 서버(/ai/v1/voice-trip)로 넘기고 응답 본문({data})을 그대로 돌려준다
// 고치기는 받아쓰기와 LLM을 차례로 불러 다른 AI 호출보다 길 수 있어 읽기 제한을 따로 둔다
@Slf4j
@Component
public class VoiceTripAiClient {

	static final String BASE = "/ai/v1/voice-trip";
	static final Duration READ_TIMEOUT = Duration.ofSeconds(90);
	private static final MediaType TEXT_UTF8 = new MediaType(MediaType.TEXT_PLAIN, StandardCharsets.UTF_8);

	public record Upload(String filename, String contentType, byte[] bytes) {
	}

	private final RestClient client;
	private final AiServerProperties properties;
	private final JsonMapper jsonMapper;

	@Autowired
	public VoiceTripAiClient(AiServerProperties properties, JsonMapper jsonMapper) {
		this(properties, jsonMapper, RestClient.builder().requestFactory(requestFactory(properties)));
	}

	// 테스트가 MockRestServiceServer를 묶은 builder를 넘긴다
	VoiceTripAiClient(AiServerProperties properties, JsonMapper jsonMapper, RestClient.Builder builder) {
		this.properties = properties;
		this.jsonMapper = jsonMapper;
		this.client = builder.baseUrl(properties.baseUrl()).build();
	}

	private static JdkClientHttpRequestFactory requestFactory(AiServerProperties properties) {
		// uvicorn은 h2c 업그레이드를 받지 않는다. HTTP/1.1로 고정한다(HttpAiServerClient와 같다)
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
				.version(HttpClient.Version.HTTP_1_1)
				.connectTimeout(properties.connectTimeout())
				.build());
		factory.setReadTimeout(READ_TIMEOUT);
		return factory;
	}

	public byte[] startJob(String text, Upload audio) {
		MultipartBodyBuilder form = new MultipartBodyBuilder();
		if (audio != null) addAudio(form, audio);
		else form.part("text", text.getBytes(StandardCharsets.UTF_8), TEXT_UTF8);
		return send("/jobs", MediaType.MULTIPART_FORM_DATA, form.build());
	}

	public byte[] getJob(String jobId) {
		return send("/jobs/" + jobId, null, null);
	}

	public byte[] fix(String draft, String text, Upload audio) {
		MultipartBodyBuilder form = new MultipartBodyBuilder();
		form.part("draft", draft.getBytes(StandardCharsets.UTF_8), TEXT_UTF8);
		if (audio != null) addAudio(form, audio);
		else form.part("text", text.getBytes(StandardCharsets.UTF_8), TEXT_UTF8);
		return send("/fixes", MediaType.MULTIPART_FORM_DATA, form.build());
	}

	public byte[] candidates(byte[] json) {
		return send("/candidates", MediaType.APPLICATION_JSON, json);
	}

	private static void addAudio(MultipartBodyBuilder form, Upload audio) {
		form.part("audio", audio.bytes(), MediaType.parseMediaType(audio.contentType()))
				.filename(audio.filename());
	}

	/** 작업 응답에서 jobId를 꺼낸다 */
	public String jobId(byte[] body) {
		try {
			String id = jsonMapper.readTree(body).path("data").path("jobId").asString();
			if (id != null && !id.isBlank()) return id;
		} catch (RuntimeException ignored) {
			// 아래에서 실패로 본다
		}
		throw new BusinessException(VoiceTripError.AI_UNAVAILABLE);
	}

	// body가 null이면 GET, 아니면 POST
	private byte[] send(String path, MediaType contentType, Object body) {
		try {
			RestClient.RequestHeadersSpec<?> request = body == null
					? client.get().uri(BASE + path)
					: client.post().uri(BASE + path).contentType(contentType).body(body);
			byte[] response = request
					.accept(MediaType.APPLICATION_JSON)
					.headers(h -> {
						if (!properties.internalToken().isEmpty()) h.set("X-Internal-Token", properties.internalToken());
					})
					.retrieve()
					.body(byte[].class);
			if (response == null) throw new BusinessException(VoiceTripError.AI_UNAVAILABLE);
			return response;
		} catch (RestClientResponseException ex) {
			int status = ex.getStatusCode().value();
			log.warn("voice_trip_ai_failed path={} status={}", logPath(path), status);
			throw toBusiness(status, ex.getResponseBodyAsByteArray());
		} catch (ResourceAccessException ex) {
			log.warn("voice_trip_ai_unreachable path={} exceptionClass={}", logPath(path), ex.getClass().getSimpleName());
			throw new BusinessException(VoiceTripError.AI_UNAVAILABLE);
		}
	}

	private static String logPath(String path) {
		return path.startsWith("/jobs/") ? "/jobs/{id}" : path;
	}

	// 사용자에게 보여 줄 4xx만 그대로 넘긴다. 401(내부 토큰)·5xx는 앱이 로그아웃으로 오해하지 않게 503으로 바꾼다
	BusinessException toBusiness(int status, byte[] body) {
		String code = null;
		String message = null;
		try {
			if (body != null && body.length <= 16384) {
				JsonNode error = jsonMapper.readTree(body).path("error");
				code = error.path("code").asString();
				message = error.path("message").asString();
			}
		} catch (RuntimeException ignored) {
			// 형식이 다르면 기본 문구를 쓴다
		}
		ErrorCode errorCode = switch (status) {
			case 400 -> CommonErrorCode.VALIDATION_ERROR;
			case 404 -> CommonErrorCode.NOT_FOUND;
			case 422 -> "INSUFFICIENT_DATA".equals(code) ? VoiceTripError.INSUFFICIENT_DATA
					: VoiceTripError.INPUT_LIMIT_EXCEEDED;
			default -> VoiceTripError.AI_UNAVAILABLE;
		};
		if (errorCode == VoiceTripError.AI_UNAVAILABLE || message == null || message.isBlank()) {
			return new BusinessException(errorCode);
		}
		return new BusinessException(errorCode, message.length() > 200 ? message.substring(0, 200) : message);
	}

}
