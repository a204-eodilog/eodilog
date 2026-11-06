package com.eodilog.global.ai;

import java.net.http.HttpClient;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Slf4j
@Component
@EnableConfigurationProperties(AiServerProperties.class)
public class HttpAiServerClient implements AiServerClient {

	static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
	static final String TRACE_ID_HEADER = "X-Trace-Id";

	private final RestClient client;
	private final AiServerProperties properties;
	private final JsonMapper jsonMapper;

	@Autowired
	public HttpAiServerClient(AiServerProperties properties, JsonMapper jsonMapper) {
		this(properties, jsonMapper, RestClient.builder().requestFactory(requestFactory(properties)));
	}

	// 테스트가 MockRestServiceServer를 묶은 builder를 넘긴다
	HttpAiServerClient(AiServerProperties properties, JsonMapper jsonMapper, RestClient.Builder builder) {
		this.properties = properties;
		this.jsonMapper = jsonMapper;
		this.client = builder.baseUrl(properties.baseUrl()).build();
	}

	private static JdkClientHttpRequestFactory requestFactory(AiServerProperties properties) {
		// 기본값 HTTP/2는 평문 http에서 h2c 업그레이드를 붙인다. uvicorn은 이를 지원하지 않아 본문이 깨지므로 1.1로 고정한다
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
				.version(HttpClient.Version.HTTP_1_1)
				.connectTimeout(properties.connectTimeout())
				.build());
		factory.setReadTimeout(properties.readTimeout());
		return factory;
	}

	@Override
	public JsonNode post(String path, UUID traceId, JsonNode body) {
		String response;
		try {
			response = client.post()
					.uri(path)
					.contentType(MediaType.APPLICATION_JSON)
					.accept(MediaType.APPLICATION_JSON)
					.headers(headers -> {
						headers.set(TRACE_ID_HEADER, traceId.toString());
						if (!properties.internalToken().isEmpty()) {
							headers.set(INTERNAL_TOKEN_HEADER, properties.internalToken());
						}
					})
					// 바이트로 보내 문자열 변환기의 기본 문자셋(ISO-8859-1)에 한글이 깨지지 않게 한다
					.body(jsonMapper.writeValueAsBytes(body))
					.retrieve()
					.body(String.class);
		} catch (RestClientResponseException ex) {
			// 응답 본문에는 오류 코드와 필드 이름만 있다(AI spec §1). 원인을 찾을 수 있게 남긴다
			log.warn("ai_call_failed path={} traceId={} status={} body={}", path, traceId, ex.getStatusCode().value(),
					abbreviate(ex.getResponseBodyAsString()));
			throw new AiServerException(ex.getStatusCode().is5xxServerError());
		} catch (ResourceAccessException ex) {
			// 연결 실패·읽기 타임아웃
			log.warn("ai_call_unreachable path={} traceId={} reason={}", path, traceId, ex.getMessage());
			throw new AiServerException(true);
		}
		return data(response);
	}

	private static String abbreviate(String text) {
		return text.length() <= 500 ? text : text.substring(0, 500) + "...";
	}

	private JsonNode data(String response) {
		try {
			JsonNode data = response == null ? null : jsonMapper.readTree(response).get("data");
			if (data == null || !data.isObject()) {
				throw new AiServerException(false);
			}
			return data;
		} catch (RuntimeException ex) {
			if (ex instanceof AiServerException aiServerException) {
				throw aiServerException;
			}
			throw new AiServerException(false);
		}
	}

}
