package com.eodilog.weather.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

// 명세 §10 Weather. 모르는 값은 null이며 0으로 채우지 않는다. 확률은 0~1
@Schema(description = "날씨. 관측이 아니라 예보이며 source로 단기·중기를 구분한다")
public record Weather(
		UUID placeId,
		LocalDate date,
		@Schema(description = "서버가 공급자에서 받은 시각. stale이면 그 마지막 성공 시각") Instant queriedAt,
		@Schema(description = "기상청 발표 시각") Instant forecastAt,
		@Schema(description = "KMA_SHORT_TERM_FORECAST(오늘~3일 뒤, 시간별) 또는 KMA_MID_TERM_FORECAST(4~10일 뒤, 시간별 없음)")
		String source,
		@Schema(description = "CLEAR, PARTLY_CLOUDY, CLOUDY, RAIN, RAIN_SNOW, SNOW, SHOWER, UNKNOWN") String condition,
		@Schema(description = "오늘이면 지금과 가장 가까운 시간의 기온, 다른 날은 null", nullable = true) Double temperatureCelsius,
		@Schema(nullable = true) Double minCelsius,
		@Schema(nullable = true) Double maxCelsius,
		@Schema(description = "그날 강수확률 최댓값(0~1)", nullable = true) Double precipitationProbability,
		@Schema(description = "그날(한국 시각) 시간별 예보. at은 UTC. 중기예보와 이미 지난 시간은 없다") List<Hourly> hourly,
		@Schema(description = "공급자 장애로 직전 조회 값을 돌려줬으면 true") boolean stale) {

	public record Hourly(Instant at, String condition, Double temperatureCelsius, Double precipitationProbability) {
	}

	public Weather asStale() {
		return new Weather(placeId, date, queriedAt, forecastAt, source, condition, temperatureCelsius, minCelsius,
				maxCelsius, precipitationProbability, hourly, true);
	}

}
