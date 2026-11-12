package com.eodilog.facility.ev;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

/** 실제 응답 모양(2026-11-11 호출해 확인)으로 해석을 본다. 네트워크는 쓰지 않는다 */
class HttpEvChargerClientTest {

	private final HttpEvChargerClient client = new HttpEvChargerClient(EvChargerSyncTest.properties("key", 9999, 4),
			JsonMapper.builder().build(), RestClient.create());

	@Test
	void parsesChargerInfoPage() {
		var page = client.page("""
				{"items":{"item":[{"statNm":"낙성대동주민센터","statId":"ME174013","chgerId":"01","chgerType":"06",
				"addr":"서울특별시 관악구 낙성대로4가길 5","lat":"37.476296","lng":"126.9583876","useTime":"24시간 이용가능",
				"busiId":"ME","busiNm":"기후에너지환경부","stat":"2","statUpdDt":"20261111133341","output":"50","delYn":"N"},
				{"statNm":"좌표없음","statId":"XX000001","chgerId":"01","lat":"","lng":"","stat":"9","statUpdDt":"","output":"","delYn":"Y"}]},
				"resultCode":"00","resultMsg":"NORMAL SERVICE.","totalCount":529081,"pageNo":1,"numOfRows":10}
				""", node -> HttpEvChargerClientTest.info(node));
		assertThat(page.totalCount()).isEqualTo(529081);
		var first = page.items().getFirst();
		assertThat(first.stationId()).isEqualTo("ME174013");
		assertThat(first.stationName()).isEqualTo("낙성대동주민센터");
		assertThat(first.latitude()).isEqualTo(37.476296);
		assertThat(first.outputKw()).isEqualTo(50);
		// 한국 시각 13:33:41 = UTC 04:33:41
		assertThat(first.statusUpdatedAt()).isEqualTo(Instant.parse("2026-11-11T04:33:41Z"));
		assertThat(first.deleted()).isFalse();
		var second = page.items().get(1);
		assertThat(Double.isNaN(second.latitude())).isTrue();
		assertThat(second.statusUpdatedAt()).isNull();
		assertThat(second.outputKw()).isNull();
		assertThat(second.deleted()).isTrue();
	}

	@Test
	void singleItemAndEmptyPages() {
		assertThat(client.page("{\"items\":{\"item\":{\"statId\":\"A\"}},\"resultCode\":\"00\",\"totalCount\":1}", n -> n).items()).hasSize(1);
		assertThat(client.page("{\"items\":\"\",\"resultCode\":\"00\",\"totalCount\":0}", n -> n).items()).isEmpty();
	}

	@Test
	void errorsBecomeUnavailableWithoutKeyOrAddress() {
		assertThatThrownBy(() -> client.page("{\"resultCode\":\"30\",\"resultMsg\":\"SERVICE_KEY_IS_NOT_REGISTERED_ERROR\"}", n -> n))
				.isInstanceOf(EvChargerUnavailableException.class).hasMessageNotContaining("key");
		assertThatThrownBy(() -> client.page("<OpenAPI_ServiceResponse/>", n -> n)).isInstanceOf(EvChargerUnavailableException.class);
		assertThatThrownBy(() -> client.page("{\"items\":\"\",\"resultCode\":\"00\",\"totalCount\":5}", n -> n))
				.isInstanceOf(EvChargerUnavailableException.class);
		var noKey = new HttpEvChargerClient(EvChargerSyncTest.properties("", 9999, 4), JsonMapper.builder().build(), RestClient.create());
		assertThatThrownBy(() -> noKey.infoPage(1, 10)).isInstanceOf(EvChargerUnavailableException.class);
	}

	@Test
	void parsesKoreanTime() {
		assertThat(HttpEvChargerClient.time("20261111000000")).isEqualTo(Instant.parse("2026-11-10T15:00:00Z"));
		assertThat(HttpEvChargerClient.time("2026")).isNull();
		assertThat(HttpEvChargerClient.time("2026111125xx00")).isNull();
	}

	private static EvChargerClient.ChargerInfo info(tools.jackson.databind.JsonNode node) {
		return HttpEvChargerClient.info(node);
	}
}
