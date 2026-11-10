package com.eodilog.weather;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.weather.dto.Weather;
import com.eodilog.weather.dto.Weather.Hourly;
import com.eodilog.weather.kma.KmaForecastClient;
import com.eodilog.weather.kma.KmaForecastClient.KmaUnavailableException;
import com.eodilog.weather.kma.KmaForecastClient.ShortTermValue;
import com.eodilog.weather.kma.KmaGrid;
import com.eodilog.weather.kma.MidForecastStation;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

// 장소·날짜의 날씨(정책 W-1~W-10). 오늘~3일 뒤는 단기예보(시간별), 그 뒤 10일 뒤까지는 중기예보(오전·오후)다
// 같은 발표는 다시 부르지 않는다(메모리 캐시). 공급자 장애 때는 직전 성공 값을 staleLimit 안에서만 stale=true로 준다
@Slf4j
@Service
@RequiredArgsConstructor
public class WeatherService {

	public static final ZoneId KST = ZoneId.of("Asia/Seoul");
	public static final String SHORT_TERM_SOURCE = "KMA_SHORT_TERM_FORECAST";
	public static final String MID_TERM_SOURCE = "KMA_MID_TERM_FORECAST";
	static final int MAX_DAYS = 10;
	static final int SHORT_TERM_DAYS = 3;
	// 발표 뒤 API에 올라오기까지의 여유. 그 전이면 NO_DATA라 직전 발표를 쓴다
	private static final Duration PUBLISH_DELAY = Duration.ofMinutes(10);
	private static final List<Integer> SHORT_TERM_HOURS = List.of(23, 20, 17, 14, 11, 8, 5, 2);
	// 강수가 있으면 하늘 상태보다 앞선다. 같은 수면 이 순서로 고른다
	private static final List<String> PRECIPITATION = List.of("RAIN", "SHOWER", "RAIN_SNOW", "SNOW");
	private static final List<String> MID_SEVERITY = List.of("RAIN_SNOW", "SNOW", "RAIN", "SHOWER", "CLOUDY",
			"PARTLY_CLOUDY", "CLEAR");

	private final KmaForecastClient client;
	private final WeatherProperties properties;
	private final Clock clock;
	private final Map<String, Snapshot<?>> cache = new ConcurrentHashMap<>();

	private record Snapshot<T>(LocalDateTime announcedAt, Instant fetchedAt, T data) {
	}

	private record Fetched<T>(Snapshot<T> snapshot, boolean stale) {
	}

	public Weather forecast(UUID placeId, double latitude, double longitude, LocalDate date) {
		Instant now = clock.instant();
		LocalDateTime nowKst = LocalDateTime.ofInstant(now, KST);
		LocalDate today = nowKst.toLocalDate();
		long days = ChronoUnit.DAYS.between(today, date);
		if (days < 0 || days > MAX_DAYS) {
			throw new BusinessException(WeatherErrorCode.WEATHER_NOT_AVAILABLE);
		}
		KmaGrid grid = KmaGrid.of(latitude, longitude)
				.orElseThrow(() -> new BusinessException(WeatherErrorCode.WEATHER_NOT_AVAILABLE));
		if (days <= SHORT_TERM_DAYS) {
			LocalDateTime latest = latestShortTermBase(nowKst);
			Fetched<List<ShortTermValue>> fetched = fetch("S:" + grid.nx() + ":" + grid.ny(),
					List.of(latest, latest.minusHours(3)), base -> client.shortTerm(grid, base), now);
			Optional<Weather> weather = fromShortTerm(placeId, date, fetched, nowKst);
			if (weather.isPresent()) {
				return weather.get();
			}
		}
		MidForecastStation station = MidForecastStation.nearest(latitude, longitude);
		LocalDateTime latest = latestMidTermAnnouncement(nowKst);
		List<LocalDateTime> candidates = List.of(latest, latest.minusHours(12));
		Fetched<JsonNode> land = fetch("L:" + station.landRegId(), candidates,
				at -> client.midLand(station.landRegId(), at), now);
		Fetched<JsonNode> temperature = fetch("T:" + station.temperatureRegId(), candidates,
				at -> client.midTemperature(station.temperatureRegId(), at), now);
		return fromMidTerm(placeId, date, land, temperature)
				.orElseThrow(() -> new BusinessException(WeatherErrorCode.WEATHER_NOT_AVAILABLE));
	}

	// 같은 스프링 컨텍스트를 쓰는 테스트가 서로의 캐시를 보지 않도록 비운다
	void clearCache() {
		cache.clear();
	}

	static LocalDateTime latestShortTermBase(LocalDateTime nowKst) {
		LocalDateTime ready = nowKst.minus(PUBLISH_DELAY);
		for (int hour : SHORT_TERM_HOURS) {
			if (ready.getHour() >= hour) {
				return ready.toLocalDate().atTime(hour, 0);
			}
		}
		return ready.toLocalDate().minusDays(1).atTime(23, 0);
	}

	static LocalDateTime latestMidTermAnnouncement(LocalDateTime nowKst) {
		LocalDateTime ready = nowKst.minus(PUBLISH_DELAY);
		if (ready.getHour() >= 18) {
			return ready.toLocalDate().atTime(18, 0);
		}
		if (ready.getHour() >= 6) {
			return ready.toLocalDate().atTime(6, 0);
		}
		return ready.toLocalDate().minusDays(1).atTime(18, 0);
	}

	// 최신 발표 → (아직 안 올라왔으면) 직전 발표. 캐시에 같은 발표가 있으면 부르지 않는다
	@SuppressWarnings("unchecked")
	private <T> Fetched<T> fetch(String key, List<LocalDateTime> candidates,
			Function<LocalDateTime, Optional<T>> call, Instant now) {
		Snapshot<T> cached = (Snapshot<T>) cache.get(key);
		try {
			for (LocalDateTime announcedAt : candidates) {
				if (cached != null && cached.announcedAt().equals(announcedAt)) {
					return new Fetched<>(cached, false);
				}
				Optional<T> data = call.apply(announcedAt);
				if (data.isPresent()) {
					Snapshot<T> snapshot = new Snapshot<>(announcedAt, now, data.get());
					cache.put(key, snapshot);
					return new Fetched<>(snapshot, false);
				}
			}
			throw new KmaUnavailableException("No KMA announcement for " + key);
		} catch (KmaUnavailableException e) {
			if (cached != null && !cached.fetchedAt().isBefore(now.minus(properties.staleLimit()))) {
				log.warn("Weather provider unavailable, serving stale {} from {}", key, cached.fetchedAt());
				return new Fetched<>(cached, true);
			}
			log.warn("Weather provider unavailable: {}", e.getMessage());
			throw new BusinessException(WeatherErrorCode.PROVIDER_UNAVAILABLE);
		}
	}

	private static Optional<Weather> fromShortTerm(UUID placeId, LocalDate date,
			Fetched<List<ShortTermValue>> fetched, LocalDateTime nowKst) {
		Map<LocalTime, Map<String, String>> byHour = new TreeMap<>();
		Double tmn = null;
		Double tmx = null;
		for (ShortTermValue value : fetched.snapshot().data()) {
			if (!value.date().equals(date)) {
				continue;
			}
			switch (value.category()) {
				case "TMN" -> tmn = number(value.value());
				case "TMX" -> tmx = number(value.value());
				case "TMP", "POP", "PTY", "SKY" ->
						byHour.computeIfAbsent(value.time(), time -> new HashMap<>()).put(value.category(), value.value());
				default -> {
				}
			}
		}
		if (byHour.isEmpty()) {
			return Optional.empty();
		}
		List<Hourly> hourly = new ArrayList<>();
		for (Map.Entry<LocalTime, Map<String, String>> entry : byHour.entrySet()) {
			Map<String, String> values = entry.getValue();
			Double pop = number(values.get("POP"));
			hourly.add(new Hourly(date.atTime(entry.getKey()).atZone(KST).toInstant(),
					condition(values.get("PTY"), values.get("SKY")), number(values.get("TMP")),
					pop == null ? null : pop / 100.0));
		}
		List<Double> temperatures = hourly.stream().map(Hourly::temperatureCelsius).filter(Objects::nonNull).toList();
		Double min = tmn != null ? tmn : temperatures.stream().min(Double::compare).orElse(null);
		Double max = tmx != null ? tmx : temperatures.stream().max(Double::compare).orElse(null);
		Double pop = hourly.stream().map(Hourly::precipitationProbability).filter(Objects::nonNull)
				.max(Double::compare).orElse(null);
		Double current = null;
		if (date.equals(nowKst.toLocalDate())) {
			Instant now = nowKst.atZone(KST).toInstant();
			current = hourly.stream().filter(hour -> hour.temperatureCelsius() != null)
					.min(Comparator.comparingLong(hour -> Math.abs(Duration.between(now, hour.at()).toMinutes())))
					.map(Hourly::temperatureCelsius).orElse(null);
		}
		Snapshot<List<ShortTermValue>> snapshot = fetched.snapshot();
		return Optional.of(new Weather(placeId, date, snapshot.fetchedAt(), snapshot.announcedAt().atZone(KST).toInstant(),
				SHORT_TERM_SOURCE, dailyCondition(hourly), current, min, max, pop, List.copyOf(hourly),
				fetched.stale()));
	}

	private static Optional<Weather> fromMidTerm(UUID placeId, LocalDate date, Fetched<JsonNode> land,
			Fetched<JsonNode> temperature) {
		long day = ChronoUnit.DAYS.between(land.snapshot().announcedAt().toLocalDate(), date);
		JsonNode item = land.snapshot().data();
		List<String> rainKeys = day <= 7 ? List.of("rnSt" + day + "Am", "rnSt" + day + "Pm") : List.of("rnSt" + day);
		List<String> skyKeys = day <= 7 ? List.of("wf" + day + "Am", "wf" + day + "Pm") : List.of("wf" + day);
		if (day < 1 || rainKeys.stream().noneMatch(item::has)) {
			return Optional.empty();
		}
		Double pop = rainKeys.stream().map(key -> number(item.path(key).asString(null))).filter(Objects::nonNull)
				.max(Double::compare).map(value -> value / 100.0).orElse(null);
		String condition = skyKeys.stream().map(key -> midCondition(item.path(key).asString("")))
				.min(Comparator.comparingInt(WeatherService::midSeverity)).orElse("UNKNOWN");
		JsonNode ta = temperature.snapshot().data();
		long taDay = ChronoUnit.DAYS.between(temperature.snapshot().announcedAt().toLocalDate(), date);
		Double min = number(ta.path("taMin" + taDay).asString(null));
		Double max = number(ta.path("taMax" + taDay).asString(null));
		Snapshot<JsonNode> snapshot = land.snapshot();
		return Optional.of(new Weather(placeId, date, Stream.of(land, temperature).map(f -> f.snapshot().fetchedAt())
				.min(Comparator.naturalOrder()).orElseThrow(), snapshot.announcedAt().atZone(KST).toInstant(),
				MID_TERM_SOURCE, condition, null, min, max, pop, List.of(), land.stale() || temperature.stale()));
	}

	// 기상청 값 중 누락 표시(-999 등)와 숫자가 아닌 값은 null이다
	static Double number(String value) {
		if (value == null || value.isBlank()) {
			return null;
		}
		try {
			double parsed = Double.parseDouble(value.strip());
			return Math.abs(parsed) >= 900 ? null : parsed;
		} catch (NumberFormatException e) {
			return null;
		}
	}

	// 강수형태(PTY)가 있으면 그 값, 없으면 하늘상태(SKY)
	static String condition(String pty, String sky) {
		String precipitation = switch (pty == null ? "" : pty.strip()) {
			case "1" -> "RAIN";
			case "2" -> "RAIN_SNOW";
			case "3" -> "SNOW";
			case "4" -> "SHOWER";
			default -> null;
		};
		if (precipitation != null) {
			return precipitation;
		}
		return switch (sky == null ? "" : sky.strip()) {
			case "1" -> "CLEAR";
			case "3" -> "PARTLY_CLOUDY";
			case "4" -> "CLOUDY";
			default -> "UNKNOWN";
		};
	}

	// 강수 시간이 있으면 가장 많은 강수 값, 없으면 가장 많은 하늘 값
	static String dailyCondition(List<Hourly> hourly) {
		Map<String, Long> counts = new HashMap<>();
		hourly.forEach(hour -> counts.merge(hour.condition(), 1L, Long::sum));
		Optional<String> precipitation = PRECIPITATION.stream().filter(counts::containsKey)
				.max(Comparator.comparingLong(counts::get)
						.thenComparing(Comparator.comparingInt(PRECIPITATION::indexOf).reversed()));
		if (precipitation.isPresent()) {
			return precipitation.get();
		}
		return Stream.of("CLEAR", "PARTLY_CLOUDY", "CLOUDY").filter(counts::containsKey)
				.max(Comparator.comparingLong(counts::get)).orElse("UNKNOWN");
	}

	// 중기예보 날씨 문구(맑음·구름많음·흐림, '구름많고 비'·'흐리고 비/눈'·'소나기' 등)
	static String midCondition(String text) {
		if (text.contains("비/눈") || text.contains("눈/비")) {
			return "RAIN_SNOW";
		}
		if (text.contains("소나기")) {
			return "SHOWER";
		}
		if (text.contains("비")) {
			return "RAIN";
		}
		if (text.contains("눈")) {
			return "SNOW";
		}
		if (text.contains("흐림") || text.contains("흐리")) {
			return "CLOUDY";
		}
		if (text.contains("구름")) {
			return "PARTLY_CLOUDY";
		}
		if (text.contains("맑음")) {
			return "CLEAR";
		}
		return "UNKNOWN";
	}

	private static int midSeverity(String condition) {
		int index = MID_SEVERITY.indexOf(condition);
		return index < 0 ? MID_SEVERITY.size() : index;
	}

}
