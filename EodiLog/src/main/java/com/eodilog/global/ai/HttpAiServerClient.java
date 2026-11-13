package com.eodilog.global.ai;

import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.UnaryOperator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpEntity;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Component;
import org.springframework.util.MultiValueMap;
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
	private static final MediaType TEXT_UTF8 = new MediaType(MediaType.TEXT_PLAIN, StandardCharsets.UTF_8);

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
		// 바이트로 보내 문자열 변환기의 기본 문자셋(ISO-8859-1)에 한글이 깨지지 않게 한다
		byte[] bytes = jsonMapper.writeValueAsBytes(body);
		return call(path, traceId, request -> request.contentType(MediaType.APPLICATION_JSON).body(bytes));
	}

	@Override
	public JsonNode postMultipart(String path, UUID traceId, Map<String, String> fields, List<FilePart> files) {
		MultipartBodyBuilder builder = multipartFields(fields);
		for (FilePart file : files) {
			builder.part(file.field(), file.bytes(), MediaType.parseMediaType(file.contentType()))
					.filename(file.filename());
		}
		MultiValueMap<String, HttpEntity<?>> body = builder.build();
		return call(path, traceId, request -> request.contentType(MediaType.MULTIPART_FORM_DATA).body(body));
	}

	@Override
	public JsonNode postMultipart(String path, UUID traceId, JsonNode meta, List<MultipartFile> files) {
		return postMultipart(path, traceId, Map.of("meta", jsonMapper.writeValueAsString(meta)), "files", files);
	}

	@Override
	public JsonNode postMultipart(String path, UUID traceId, Map<String, String> fields,
			String fileFieldName, List<MultipartFile> files) {
		MultipartBodyBuilder builder = multipartFields(fields);
		for (MultipartFile file : files) {
			builder.part(fileFieldName, new org.springframework.core.io.FileSystemResource(file.path()),
					MediaType.parseMediaType(file.contentType()));
		}
		return call(path, traceId, request -> request.contentType(MediaType.MULTIPART_FORM_DATA).body(builder.build()));
	}

	private static MultipartBodyBuilder multipartFields(Map<String, String> fields) {
		MultipartBodyBuilder builder = new MultipartBodyBuilder();
		fields.forEach((name, value) -> {
			if (value != null) builder.part(name, value.getBytes(StandardCharsets.UTF_8), TEXT_UTF8);
		});
		return builder;
	}

	private JsonNode call(String path, UUID traceId, UnaryOperator<RestClient.RequestBodySpec> withBody) {
		String response;
		try {
			RestClient.RequestBodySpec request = client.post()
					.uri(path)
					.accept(MediaType.APPLICATION_JSON)
					.headers(headers -> {
						headers.set(TRACE_ID_HEADER, traceId.toString());
						if (!properties.internalToken().isEmpty()) {
							headers.set(INTERNAL_TOKEN_HEADER, properties.internalToken());
						}
					});
			response = withBody.apply(request)
					.retrieve()
					.body(String.class);
		} catch (RestClientResponseException ex) {
			// 외부 응답/예외 메시지에는 자료·URL이 포함될 수 있어 상태와 분류만 기록한다.
			log.warn("ai_call_failed path={} traceId={} status={}", path, traceId, ex.getStatusCode().value());
			String code = null;
			try {
				if (ex.getResponseBodyAsByteArray().length <= 16384)
					code = jsonMapper.readTree(ex.getResponseBodyAsString()).path("error").path("code").asString();
			} catch (RuntimeException ignored) { }
			throw new AiServerException(ex.getStatusCode().value(), code);
		} catch (ResourceAccessException ex) {
			// 연결 실패·읽기 타임아웃
			log.warn("ai_call_unreachable path={} traceId={} exceptionClass={}", path, traceId, ex.getClass().getSimpleName());
			boolean timedOut = false;
			for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
				if (cause instanceof java.net.SocketTimeoutException
						|| cause instanceof java.net.http.HttpTimeoutException) timedOut = true;
			}
			throw new AiServerException(true, timedOut);
		}
		return data(response);
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
