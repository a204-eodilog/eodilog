package com.eodilog.weather.kma;

import com.eodilog.weather.WeatherProperties;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// data.go.kr 기상청 API(JSON). 인증 오류는 HTTP 403과 다른 모양의 본문(OpenAPI_ServiceResponse)으로 오고,
// 업무 오류는 200에 resultCode로 온다. 00은 정상, 03(NO_DATA)은 그 발표가 아직 없음, 나머지는 장애로 본다
@Slf4j
@Component
@EnableConfigurationProperties(WeatherProperties.class)
public class HttpKmaForecastClient implements KmaForecastClient {

	private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("yyyyMMdd");
	private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HHmm");
	private static final DateTimeFormatter ANNOUNCED = DateTimeFormatter.ofPattern("yyyyMMddHHmm");
	// 02시 발표가 글피까지 가장 많은 값을 준다(약 1,300개). 한 쪽으로 받는다
	private static final int SHORT_TERM_ROWS = 2000;

	private final WeatherProperties properties;
	private final JsonMapper jsonMapper;
	private final RestClient client;

	@Autowired
	public HttpKmaForecastClient(WeatherProperties properties, JsonMapper jsonMapper) {
		this(properties, jsonMapper, RestClient.builder().requestFactory(requestFactory(properties)));
	}

	HttpKmaForecastClient(WeatherProperties properties, JsonMapper jsonMapper, RestClient.Builder builder) {
		this.properties = properties;
		this.jsonMapper = jsonMapper;
		this.client = builder.build();
	}

	private static JdkClientHttpRequestFactory requestFactory(WeatherProperties properties) {
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
				HttpClient.newBuilder().connectTimeout(properties.connectTimeout()).build());
		factory.setReadTimeout(properties.readTimeout());
		return factory;
	}

	@Override
	public Optional<List<ShortTermValue>> shortTerm(KmaGrid grid, LocalDateTime baseTime) {
		Optional<JsonNode> items = items("/VilageFcstInfoService_2.0/getVilageFcst", "numOfRows=" + SHORT_TERM_ROWS
				+ "&base_date=" + DATE.format(baseTime) + "&base_time=" + TIME.format(baseTime)
				+ "&nx=" + grid.nx() + "&ny=" + grid.ny());
		return items.map(nodes -> {
			List<ShortTermValue> values = new ArrayList<>();
			for (JsonNode node : nodes) {
				try {
					values.add(new ShortTermValue(node.path("category").asString(),
							LocalDate.parse(node.path("fcstDate").asString(), DATE),
							LocalTime.parse(node.path("fcstTime").asString(), TIME),
							node.path("fcstValue").asString()));
				} catch (RuntimeException e) {
					throw new KmaUnavailableException("Invalid KMA short-term item", e);
				}
			}
			return values;
		});
	}

	@Override
	public Optional<JsonNode> midLand(String landRegId, LocalDateTime announcedAt) {
		return firstItem("/MidFcstInfoService/getMidLandFcst", landRegId, announcedAt);
	}

	@Override
	public Optional<JsonNode> midTemperature(String temperatureRegId, LocalDateTime announcedAt) {
		return firstItem("/MidFcstInfoService/getMidTa", temperatureRegId, announcedAt);
	}

	private Optional<JsonNode> firstItem(String path, String regId, LocalDateTime announcedAt) {
		return items(path, "numOfRows=10&regId=" + regId + "&tmFc=" + ANNOUNCED.format(announcedAt))
				.map(nodes -> {
					if (nodes.isEmpty()) {
						throw new KmaUnavailableException("Empty KMA mid-term items");
					}
					return nodes.get(0);
				});
	}

	private Optional<JsonNode> items(String path, String query) {
		if (!properties.hasKey()) {
			throw new KmaUnavailableException("KMA service key is not configured");
		}
		URI uri;
		try {
			uri = URI.create(properties.baseUrl() + path + "?serviceKey=" + encodedKey()
					+ "&pageNo=1&dataType=JSON&" + query);
		} catch (IllegalArgumentException e) {
			// 예외 문구에 키가 든 URI가 들어가므로 버린다(base-url 설정 오류)
			throw new KmaUnavailableException("Invalid KMA URI: " + path);
		}
		String body;
		try {
			body = client.get().uri(uri).retrieve().body(String.class);
		} catch (RestClientException e) {
			// URI에 키가 들어 있으므로 예외 문구를 그대로 남기지 않는다
			throw new KmaUnavailableException("KMA request failed: " + path + " (" + e.getClass().getSimpleName() + ")");
		}
		JsonNode root;
		try {
			root = jsonMapper.readTree(body == null ? "" : body);
		} catch (JacksonException e) {
			throw new KmaUnavailableException("KMA response is not JSON: " + path);
		}
		JsonNode header = root.path("response").path("header");
		String code = header.path("resultCode").asString("");
		if ("03".equals(code)) {
			return Optional.empty();
		}
		if (!"00".equals(code)) {
			log.warn("KMA error {} {} {}", path, code, header.path("resultMsg").asString(""));
			throw new KmaUnavailableException("KMA result " + code + ": " + path);
		}
		JsonNode items = root.path("response").path("body").path("items").path("item");
		if (items.isObject()) {
			return Optional.of(jsonMapper.createArrayNode().add(items));
		}
		if (!items.isArray()) {
			throw new KmaUnavailableException("KMA response has no items: " + path);
		}
		return Optional.of(items);
	}

	// data.go.kr 키는 디코딩 값(+,/,=)이나 이미 인코딩된 값(%2B)으로 받을 수 있다. 한 번만 인코딩해 보낸다
	private String encodedKey() {
		String key = properties.serviceKey();
		String decoded = key.matches(".*%[0-9A-Fa-f]{2}.*") ? URLDecoder.decode(key, StandardCharsets.UTF_8) : key;
		return URLEncoder.encode(decoded, StandardCharsets.UTF_8);
	}

}
