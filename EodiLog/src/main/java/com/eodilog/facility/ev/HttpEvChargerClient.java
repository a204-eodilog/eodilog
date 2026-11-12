package com.eodilog.facility.ev;

import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * data.go.kr 한국환경공단 충전소 정보(JSON, UTF-8). 정상은 맨 위 resultCode 00이고 items.item에 줄이 온다.
 * 키 미등록은 HTTP 403과 다른 모양의 본문으로 온다. 시각(statUpdDt)은 한국 시각 yyyyMMddHHmmss다.
 * 요청 주소에 인증키가 들어가므로 예외 문구·로그에 주소를 싣지 않는다
 */
@Component
@EnableConfigurationProperties(EvChargerProperties.class)
public class HttpEvChargerClient implements EvChargerClient {

	private static final ZoneId KST = ZoneId.of("Asia/Seoul");
	private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

	private final EvChargerProperties properties;
	private final JsonMapper json;
	private final RestClient http;

	@Autowired
	public HttpEvChargerClient(EvChargerProperties properties, JsonMapper json) {
		this(properties, json, RestClient.builder().requestFactory(requestFactory(properties)).build());
	}

	HttpEvChargerClient(EvChargerProperties properties, JsonMapper json, RestClient http) {
		this.properties = properties;
		this.json = json;
		this.http = http;
	}

	private static JdkClientHttpRequestFactory requestFactory(EvChargerProperties properties) {
		var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(properties.connectTimeout()).build());
		factory.setReadTimeout(properties.readTimeout());
		return factory;
	}

	@Override
	public Page<ChargerInfo> infoPage(int pageNo, int rows) {
		return page(fetch("getChargerInfo", "pageNo=" + pageNo + "&numOfRows=" + rows), HttpEvChargerClient::info);
	}

	@Override
	public Page<ChargerStatus> statusPage(int pageNo, int rows, int periodMinutes) {
		return page(fetch("getChargerStatus", "pageNo=" + pageNo + "&numOfRows=" + rows + "&period=" + periodMinutes),
				node -> new ChargerStatus(text(node, "statId"), text(node, "chgerId"), text(node, "stat"),
						time(text(node, "statUpdDt"))));
	}

	private String fetch(String operation, String query) {
		if (!properties.hasKey()) throw new EvChargerUnavailableException("EV charger service key is not set");
		URI uri = URI.create(properties.baseUrl() + "/" + operation + "?serviceKey=" + encodedKey() + "&dataType=JSON&" + query);
		try {
			byte[] body = http.get().uri(uri).retrieve().body(byte[].class);
			return body == null ? "" : new String(body, StandardCharsets.UTF_8);
		} catch (RestClientException e) {
			throw new EvChargerUnavailableException("EV charger request failed: " + operation + " (" + e.getClass().getSimpleName() + ")");
		}
	}

	<T> Page<T> page(String body, Function<JsonNode, T> mapper) {
		JsonNode root;
		try {
			root = json.readTree(body);
		} catch (JacksonException e) {
			throw new EvChargerUnavailableException("EV charger response is not JSON");
		}
		String code = root.path("resultCode").asString("");
		if (!"00".equals(code)) throw new EvChargerUnavailableException("EV charger result " + (code.isEmpty() ? "missing" : code));
		long total = root.path("totalCount").asLong(0);
		JsonNode items = root.path("items").path("item");
		List<T> rows = new ArrayList<>();
		if (items.isObject()) rows.add(mapper.apply(items));
		else if (items.isArray()) for (JsonNode item : items) rows.add(mapper.apply(item));
		else if (total > 0) throw new EvChargerUnavailableException("EV charger response has no items");
		return new Page<>(total, rows);
	}

	// 좌표가 비었거나 숫자가 아니면 NaN으로 두고 적재에서 버린다
	static ChargerInfo info(JsonNode node) {
		return new ChargerInfo(text(node, "statId"), text(node, "statNm"), text(node, "addr"), number(text(node, "lat")),
				number(text(node, "lng")), text(node, "busiNm"), text(node, "useTime"), text(node, "chgerId"),
				text(node, "chgerType"), integer(text(node, "output")), text(node, "stat"), time(text(node, "statUpdDt")),
				"Y".equalsIgnoreCase(text(node, "delYn")));
	}

	private static String text(JsonNode node, String field) {
		String value = node.path(field).asString("").strip();
		return value.isEmpty() ? null : value;
	}

	private static double number(String value) {
		try {
			return value == null ? Double.NaN : Double.parseDouble(value);
		} catch (NumberFormatException e) {
			return Double.NaN;
		}
	}

	private static Integer integer(String value) {
		try {
			return value == null ? null : (int) Math.round(Double.parseDouble(value));
		} catch (NumberFormatException e) {
			return null;
		}
	}

	static Instant time(String value) {
		if (value == null || value.length() != 14) return null;
		try {
			return LocalDateTime.parse(value, TIME).atZone(KST).toInstant();
		} catch (RuntimeException e) {
			return null;
		}
	}

	// data.go.kr 키는 디코딩 값(+,/,=)이나 이미 인코딩된 값(%2B)으로 받을 수 있다. 한 번만 인코딩해 보낸다
	private String encodedKey() {
		String key = properties.serviceKey();
		String decoded = key.matches(".*%[0-9A-Fa-f]{2}.*") ? URLDecoder.decode(key, StandardCharsets.UTF_8) : key;
		return URLEncoder.encode(decoded, StandardCharsets.UTF_8);
	}

}
