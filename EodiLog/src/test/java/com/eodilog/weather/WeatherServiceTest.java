package com.eodilog.weather;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.weather.dto.Weather;
import com.eodilog.weather.kma.KmaForecastClient;
import com.eodilog.weather.kma.KmaForecastClient.KmaUnavailableException;
import com.eodilog.weather.kma.KmaForecastClient.ShortTermValue;
import com.eodilog.weather.kma.KmaGrid;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

// 기상청 응답 → Weather 매핑, 예보 범위, 발표 시각 고르기, 캐시·stale(정책 W-2~W-10)
class WeatherServiceTest {

	private static final ZoneId KST = ZoneId.of("Asia/Seoul");
	private static final double SEOUL_LAT = 37.5665;
	private static final double SEOUL_LON = 126.9780;
	private static final double BUSAN_LAT = 35.1587;
	private static final double BUSAN_LON = 129.1604;

	private final KmaForecastClient client = mock(KmaForecastClient.class);
	private final JsonMapper jsonMapper = JsonMapper.builder().build();
	private final UUID placeId = UUID.randomUUID();
	private MutableClock clock;
	private WeatherService service;

	@BeforeEach
	void setUp() {
		// 2026-11-09 09:00 KST. 최신 단기 발표는 08:00, 중기 발표는 06:00
		clock = new MutableClock(LocalDateTime.of(2026, 11, 9, 9, 0).atZone(KST).toInstant());
		service = new WeatherService(client, new WeatherProperties("key", "https://example.test", Duration.ofSeconds(3),
				Duration.ofSeconds(5), Duration.ofHours(6)), clock);
	}

	@Test
	void gridMatchesKmaGuideExample() {
		assertThat(KmaGrid.of(SEOUL_LAT, SEOUL_LON)).contains(new KmaGrid(60, 127));
		assertThat(KmaGrid.of(0, 0)).isEmpty();
	}

	@Test
	void mapsShortTermForecastForTomorrow() {
		LocalDate tomorrow = LocalDate.of(2026, 11, 10);
		List<ShortTermValue> values = new ArrayList<>();
		hour(values, tomorrow, 9, "8", "70", "1", "4");
		hour(values, tomorrow, 10, "9", "20", "0", "3");
		hour(values, tomorrow, 11, "11", "0", "0", "1");
		values.add(new ShortTermValue("TMN", tomorrow, LocalTime.of(6, 0), "3.0"));
		values.add(new ShortTermValue("TMX", tomorrow, LocalTime.of(15, 0), "12.0"));
		// 다른 날 값과 쓰지 않는 항목은 무시한다
		hour(values, LocalDate.of(2026, 11, 9), 12, "15", "90", "1", "4");
		values.add(new ShortTermValue("WSD", tomorrow, LocalTime.of(9, 0), "3.1"));
		when(client.shortTerm(new KmaGrid(60, 127), LocalDateTime.of(2026, 11, 9, 8, 0)))
				.thenReturn(Optional.of(values));

		Weather weather = service.forecast(placeId, SEOUL_LAT, SEOUL_LON, tomorrow);

		assertThat(weather.placeId()).isEqualTo(placeId);
		assertThat(weather.date()).isEqualTo(tomorrow);
		assertThat(weather.source()).isEqualTo("KMA_SHORT_TERM_FORECAST");
		assertThat(weather.forecastAt()).isEqualTo(Instant.parse("2026-11-08T23:00:00Z"));
		assertThat(weather.queriedAt()).isEqualTo(clock.instant());
		assertThat(weather.condition()).isEqualTo("RAIN");
		assertThat(weather.temperatureCelsius()).isNull();
		assertThat(weather.minCelsius()).isEqualTo(3.0);
		assertThat(weather.maxCelsius()).isEqualTo(12.0);
		assertThat(weather.precipitationProbability()).isEqualTo(0.7);
		assertThat(weather.stale()).isFalse();
		assertThat(weather.hourly()).extracting(Weather.Hourly::at).containsExactly(
				Instant.parse("2026-11-10T00:00:00Z"), Instant.parse("2026-11-10T01:00:00Z"),
				Instant.parse("2026-11-10T02:00:00Z"));
		assertThat(weather.hourly()).extracting(Weather.Hourly::condition)
				.containsExactly("RAIN", "PARTLY_CLOUDY", "CLEAR");
		assertThat(weather.hourly()).extracting(Weather.Hourly::precipitationProbability)
				.containsExactly(0.7, 0.2, 0.0);
	}

	@Test
	void todayUsesNearestHourAndHourlyRangeWithoutTmnTmx() {
		LocalDate today = LocalDate.of(2026, 11, 9);
		List<ShortTermValue> values = new ArrayList<>();
		hour(values, today, 9, "5", "10", "0", "1");
		hour(values, today, 10, "7", "10", "0", "1");
		hour(values, today, 11, "-999", "", "0", "4");
		when(client.shortTerm(any(), any())).thenReturn(Optional.of(values));

		Weather weather = service.forecast(placeId, SEOUL_LAT, SEOUL_LON, today);

		assertThat(weather.temperatureCelsius()).isEqualTo(5.0);
		assertThat(weather.minCelsius()).isEqualTo(5.0);
		assertThat(weather.maxCelsius()).isEqualTo(7.0);
		assertThat(weather.condition()).isEqualTo("CLEAR");
		// 누락 값(-999·빈 값)은 0이 아니라 null이다
		assertThat(weather.hourly().get(2).temperatureCelsius()).isNull();
		assertThat(weather.hourly().get(2).precipitationProbability()).isNull();
	}

	@Test
	void rejectsPastFarFutureAndForeignPlacesWithoutCallingProvider() {
		assertNotAvailable(() -> service.forecast(placeId, SEOUL_LAT, SEOUL_LON, LocalDate.of(2026, 11, 8)));
		assertNotAvailable(() -> service.forecast(placeId, SEOUL_LAT, SEOUL_LON, LocalDate.of(2026, 11, 20)));
		assertNotAvailable(() -> service.forecast(placeId, 0, 0, LocalDate.of(2026, 11, 10)));
		verify(client, never()).shortTerm(any(), any());
		verify(client, never()).midLand(any(), any());
	}

	@Test
	void mapsMidTermAmPmAndSingleDayValues() {
		LocalDateTime announced = LocalDateTime.of(2026, 11, 9, 6, 0);
		when(client.midLand("11H20000", announced)).thenReturn(Optional.of(jsonMapper.readTree("""
				{"regId":"11H20000","rnSt5Am":20,"rnSt5Pm":60,"wf5Am":"구름많음","wf5Pm":"흐리고 비",
				 "rnSt9":10,"wf9":"맑음"}""")));
		when(client.midTemperature("11H20201", announced)).thenReturn(Optional.of(jsonMapper.readTree("""
				{"regId":"11H20201","taMin5":8,"taMax5":14,"taMin9":3,"taMax9":11}""")));

		// 부산 해운대 → 가장 가까운 지점은 부산(11H20201), 구역은 부산·울산·경남(11H20000)
		Weather day5 = service.forecast(placeId, BUSAN_LAT, BUSAN_LON, LocalDate.of(2026, 11, 14));
		assertThat(day5.source()).isEqualTo("KMA_MID_TERM_FORECAST");
		assertThat(day5.forecastAt()).isEqualTo(Instant.parse("2026-11-08T21:00:00Z"));
		assertThat(day5.condition()).isEqualTo("RAIN");
		assertThat(day5.precipitationProbability()).isEqualTo(0.6);
		assertThat(day5.minCelsius()).isEqualTo(8.0);
		assertThat(day5.maxCelsius()).isEqualTo(14.0);
		assertThat(day5.temperatureCelsius()).isNull();
		assertThat(day5.hourly()).isEmpty();

		Weather day9 = service.forecast(placeId, BUSAN_LAT, BUSAN_LON, LocalDate.of(2026, 11, 18));
		assertThat(day9.condition()).isEqualTo("CLEAR");
		assertThat(day9.precipitationProbability()).isEqualTo(0.1);
		// 같은 발표는 다시 부르지 않는다
		verify(client, times(1)).midLand(any(), any());
		verify(client, times(1)).midTemperature(any(), any());
		verify(client, never()).shortTerm(any(), any());
	}

	@Test
	void threeDaysAheadFallsBackToMidTermWhenShortTermHasNoValues() {
		// 03:00 KST: 최신 단기 발표 02:00은 그 다음 날 값까지만, 중기 최신 발표는 전날 18:00
		clock.set(LocalDateTime.of(2026, 11, 9, 3, 0).atZone(KST).toInstant());
		when(client.shortTerm(any(), any())).thenReturn(Optional.of(List.of()));
		LocalDateTime announced = LocalDateTime.of(2026, 11, 8, 18, 0);
		when(client.midLand(any(), eq(announced))).thenReturn(Optional.of(jsonMapper.readTree("""
				{"rnSt4Am":30,"rnSt4Pm":10,"wf4Am":"흐림","wf4Pm":"맑음"}""")));
		when(client.midTemperature(any(), eq(announced))).thenReturn(Optional.of(jsonMapper.readTree("""
				{"taMin4":2,"taMax4":9}""")));

		Weather weather = service.forecast(placeId, SEOUL_LAT, SEOUL_LON, LocalDate.of(2026, 11, 12));

		assertThat(weather.source()).isEqualTo("KMA_MID_TERM_FORECAST");
		assertThat(weather.condition()).isEqualTo("CLOUDY");
		assertThat(weather.precipitationProbability()).isEqualTo(0.3);
	}

	@Test
	void usesPreviousAnnouncementWhenLatestIsNotPublishedYet() {
		LocalDate tomorrow = LocalDate.of(2026, 11, 10);
		List<ShortTermValue> values = new ArrayList<>();
		hour(values, tomorrow, 9, "8", "10", "0", "1");
		when(client.shortTerm(any(), eq(LocalDateTime.of(2026, 11, 9, 8, 0)))).thenReturn(Optional.empty());
		when(client.shortTerm(any(), eq(LocalDateTime.of(2026, 11, 9, 5, 0)))).thenReturn(Optional.of(values));

		Weather weather = service.forecast(placeId, SEOUL_LAT, SEOUL_LON, tomorrow);

		assertThat(weather.forecastAt()).isEqualTo(Instant.parse("2026-11-08T20:00:00Z"));
	}

	@Test
	void servesStaleValueWithinLimitAndFailsAfterIt() {
		LocalDate tomorrow = LocalDate.of(2026, 11, 10);
		List<ShortTermValue> values = new ArrayList<>();
		hour(values, tomorrow, 9, "8", "10", "0", "1");
		Instant firstQuery = clock.instant();
		when(client.shortTerm(any(), eq(LocalDateTime.of(2026, 11, 9, 8, 0)))).thenReturn(Optional.of(values));
		service.forecast(placeId, SEOUL_LAT, SEOUL_LON, tomorrow);

		// 3시간 뒤 새 발표(11:00)를 부르다 장애가 나면 직전 값을 stale로 준다
		when(client.shortTerm(any(), eq(LocalDateTime.of(2026, 11, 9, 11, 0))))
				.thenThrow(new KmaUnavailableException("down"));
		clock.set(firstQuery.plus(Duration.ofHours(3)));
		Weather stale = service.forecast(placeId, SEOUL_LAT, SEOUL_LON, tomorrow);
		assertThat(stale.stale()).isTrue();
		assertThat(stale.queriedAt()).isEqualTo(firstQuery);

		// 6시간을 넘기면 503
		when(client.shortTerm(any(), eq(LocalDateTime.of(2026, 11, 9, 14, 0))))
				.thenThrow(new KmaUnavailableException("down"));
		clock.set(firstQuery.plus(Duration.ofHours(6)).plusSeconds(60));
		assertThatThrownBy(() -> service.forecast(placeId, SEOUL_LAT, SEOUL_LON, tomorrow))
				.isInstanceOfSatisfying(BusinessException.class,
						ex -> assertThat(ex.getErrorCode()).isEqualTo(WeatherErrorCode.PROVIDER_UNAVAILABLE));
	}

	@Test
	void providerFailureWithoutCacheIsUnavailable() {
		when(client.shortTerm(any(), any())).thenThrow(new KmaUnavailableException("no key"));
		assertThatThrownBy(() -> service.forecast(placeId, SEOUL_LAT, SEOUL_LON, LocalDate.of(2026, 11, 10)))
				.isInstanceOfSatisfying(BusinessException.class,
						ex -> assertThat(ex.getErrorCode()).isEqualTo(WeatherErrorCode.PROVIDER_UNAVAILABLE));
	}

	@Test
	void midTermTextConditions() {
		assertThat(WeatherService.midCondition("흐리고 비/눈")).isEqualTo("RAIN_SNOW");
		assertThat(WeatherService.midCondition("구름많고 소나기")).isEqualTo("SHOWER");
		assertThat(WeatherService.midCondition("구름많고 눈")).isEqualTo("SNOW");
		assertThat(WeatherService.midCondition("구름많음")).isEqualTo("PARTLY_CLOUDY");
		assertThat(WeatherService.midCondition("흐림")).isEqualTo("CLOUDY");
		assertThat(WeatherService.midCondition("")).isEqualTo("UNKNOWN");
	}

	private static void hour(List<ShortTermValue> values, LocalDate date, int hour, String tmp, String pop, String pty,
			String sky) {
		LocalTime time = LocalTime.of(hour, 0);
		values.add(new ShortTermValue("TMP", date, time, tmp));
		values.add(new ShortTermValue("POP", date, time, pop));
		values.add(new ShortTermValue("PTY", date, time, pty));
		values.add(new ShortTermValue("SKY", date, time, sky));
	}

	private static void assertNotAvailable(org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
		assertThatThrownBy(call).isInstanceOfSatisfying(BusinessException.class,
				ex -> assertThat(ex.getErrorCode()).isEqualTo(WeatherErrorCode.WEATHER_NOT_AVAILABLE));
	}

	private static final class MutableClock extends Clock {

		private Instant now;

		MutableClock(Instant now) {
			this.now = now;
		}

		void set(Instant now) {
			this.now = now;
		}

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return this;
		}

		@Override
		public Instant instant() {
			return now;
		}

	}

}
