package com.eodilog.weather;

import static org.assertj.core.api.Assertions.assertThat;

import com.eodilog.weather.dto.Weather;
import com.eodilog.weather.kma.HttpKmaForecastClient;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;

// 실제 기상청 API로 단기(내일)·중기(5·10일 뒤) 조회. 평소 build에서는 건너뛴다
// KMA_SERVICE_KEY(data.go.kr 단기·중기예보 활용 승인 키)를 환경 변수로 주고 돌린다
@EnabledIfEnvironmentVariable(named = "KMA_SERVICE_KEY", matches = ".+")
class WeatherRealProviderTest {

	private final WeatherService service = new WeatherService(
			new HttpKmaForecastClient(properties(), JsonMapper.builder().build()), properties(), Clock.systemUTC());

	private static WeatherProperties properties() {
		return new WeatherProperties(System.getenv("KMA_SERVICE_KEY"), "https://apis.data.go.kr/1360000",
				Duration.ofSeconds(3), Duration.ofSeconds(10), Duration.ofHours(6));
	}

	@Test
	void readsShortAndMidTermForecasts() {
		LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
		UUID placeId = UUID.randomUUID();

		Weather tomorrow = service.forecast(placeId, 35.1587, 129.1604, today.plusDays(1));
		assertThat(tomorrow.source()).isEqualTo("KMA_SHORT_TERM_FORECAST");
		assertThat(tomorrow.hourly()).hasSize(24);
		assertThat(tomorrow.minCelsius()).isNotNull();
		assertThat(tomorrow.maxCelsius()).isNotNull();
		assertThat(tomorrow.precipitationProbability()).isBetween(0.0, 1.0);
		assertThat(tomorrow.stale()).isFalse();

		Weather day5 = service.forecast(placeId, 37.5665, 126.9780, today.plusDays(5));
		assertThat(day5.source()).isEqualTo("KMA_MID_TERM_FORECAST");
		assertThat(day5.hourly()).isEmpty();
		assertThat(day5.condition()).isNotEqualTo("UNKNOWN");
		assertThat(day5.minCelsius()).isNotNull();

		Weather day10 = service.forecast(placeId, 33.4996, 126.5312, today.plusDays(10));
		assertThat(day10.source()).isEqualTo("KMA_MID_TERM_FORECAST");
		assertThat(day10.precipitationProbability()).isNotNull();
	}

}
