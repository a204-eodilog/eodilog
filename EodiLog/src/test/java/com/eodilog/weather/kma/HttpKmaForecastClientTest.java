package com.eodilog.weather.kma;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.eodilog.weather.WeatherProperties;
import com.eodilog.weather.kma.KmaForecastClient.KmaUnavailableException;
import com.eodilog.weather.kma.KmaForecastClient.ShortTermValue;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// data.go.kr 기상청 응답 형태별 처리(정책 W-4·W-5). 실제 응답 모양은 2026-11-09 호출 결과를 줄여 옮겼다
class HttpKmaForecastClientTest {

	private static final String BASE = "https://apis.example.test/1360000";
	private static final LocalDateTime BASE_TIME = LocalDateTime.of(2026, 11, 9, 8, 0);

	private MockRestServiceServer server;

	private HttpKmaForecastClient client(String key) {
		RestClient.Builder builder = RestClient.builder();
		server = MockRestServiceServer.bindTo(builder).build();
		return new HttpKmaForecastClient(new WeatherProperties(key, BASE, Duration.ofSeconds(3), Duration.ofSeconds(5),
				Duration.ofHours(6)), JsonMapper.builder().build(), builder);
	}

	@Test
	void parsesShortTermItemsAndEncodesDecodedKeyOnce() {
		HttpKmaForecastClient client = client("a+b/c=");
		server.expect(requestTo(BASE + "/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=a%2Bb%2Fc%3D&pageNo=1"
				+ "&dataType=JSON&numOfRows=2000&base_date=20261109&base_time=0800&nx=60&ny=127"))
				.andExpect(method(HttpMethod.GET))
				.andRespond(withSuccess("""
						{"response":{"header":{"resultCode":"00","resultMsg":"NORMAL_SERVICE"},"body":{"dataType":"JSON",
						"items":{"item":[
						{"baseDate":"20261109","baseTime":"0800","category":"TMP","fcstDate":"20261109","fcstTime":"0900","fcstValue":"6","nx":60,"ny":127},
						{"baseDate":"20261109","baseTime":"0800","category":"POP","fcstDate":"20261110","fcstTime":"1300","fcstValue":"30","nx":60,"ny":127}
						]},"pageNo":1,"numOfRows":2000,"totalCount":2}}}""", MediaType.APPLICATION_JSON));

		Optional<List<ShortTermValue>> values = client.shortTerm(new KmaGrid(60, 127), BASE_TIME);

		assertThat(values).contains(List.of(
				new ShortTermValue("TMP", LocalDate.of(2026, 11, 9), LocalTime.of(9, 0), "6"),
				new ShortTermValue("POP", LocalDate.of(2026, 11, 10), LocalTime.of(13, 0), "30")));
		server.verify();
	}

	@Test
	void keepsAlreadyEncodedKey() {
		HttpKmaForecastClient client = client("a%2Bb");
		server.expect(requestTo(BASE + "/MidFcstInfoService/getMidLandFcst?serviceKey=a%2Bb&pageNo=1&dataType=JSON"
				+ "&numOfRows=10&regId=11B00000&tmFc=202611090600"))
				.andRespond(withSuccess("""
						{"response":{"header":{"resultCode":"00","resultMsg":"NORMAL_SERVICE"},"body":{"dataType":"JSON",
						"items":{"item":[{"regId":"11B00000","rnSt4Am":10,"wf4Am":"맑음"}]},"totalCount":1}}}""",
						MediaType.APPLICATION_JSON));

		Optional<JsonNode> item = client.midLand("11B00000", LocalDateTime.of(2026, 11, 9, 6, 0));

		assertThat(item).isPresent();
		assertThat(item.get().get("rnSt4Am").asInt()).isEqualTo(10);
	}

	@Test
	void noDataMeansAnnouncementNotPublishedYet() {
		HttpKmaForecastClient client = client("key");
		server.expect(requestTo(org.hamcrest.Matchers.startsWith(BASE + "/MidFcstInfoService/getMidTa")))
				.andRespond(withSuccess("{\"response\":{\"header\":{\"resultCode\":\"03\",\"resultMsg\":\"NO_DATA\"}}}",
						MediaType.APPLICATION_JSON));

		assertThat(client.midTemperature("11B10101", LocalDateTime.of(2026, 11, 9, 18, 0))).isEmpty();
	}

	@Test
	void businessErrorAuthErrorAndNonJsonAreUnavailable() {
		HttpKmaForecastClient business = client("key");
		server.expect(requestTo(org.hamcrest.Matchers.startsWith(BASE)))
				.andRespond(withSuccess("{\"response\":{\"header\":{\"resultCode\":\"10\",\"resultMsg\":\"BAD\"}}}",
						MediaType.APPLICATION_JSON));
		assertThatThrownBy(() -> business.shortTerm(new KmaGrid(60, 127), BASE_TIME))
				.isInstanceOf(KmaUnavailableException.class);

		HttpKmaForecastClient unregistered = client("key");
		server.expect(requestTo(org.hamcrest.Matchers.startsWith(BASE)))
				.andRespond(withStatus(HttpStatus.FORBIDDEN).contentType(MediaType.APPLICATION_JSON).body("""
						{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":"SERVICE_KEY_IS_NOT_REGISTERED_ERROR"}}}"""));
		assertThatThrownBy(() -> unregistered.shortTerm(new KmaGrid(60, 127), BASE_TIME))
				.isInstanceOf(KmaUnavailableException.class)
				.hasMessageNotContaining("key");

		HttpKmaForecastClient xml = client("key");
		server.expect(requestTo(org.hamcrest.Matchers.startsWith(BASE)))
				.andRespond(withSuccess("<OpenAPI_ServiceResponse/>", MediaType.APPLICATION_XML));
		assertThatThrownBy(() -> xml.shortTerm(new KmaGrid(60, 127), BASE_TIME))
				.isInstanceOf(KmaUnavailableException.class);
	}

	@Test
	void missingKeyFailsWithoutRequest() {
		HttpKmaForecastClient client = client(" ");
		assertThatThrownBy(() -> client.shortTerm(new KmaGrid(60, 127), BASE_TIME))
				.isInstanceOf(KmaUnavailableException.class);
		server.verify();
	}

}
