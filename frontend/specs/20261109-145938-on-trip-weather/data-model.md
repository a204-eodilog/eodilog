# Data Model: 여행 중과 날씨 대안

- **Weather**: `placeId, date, queriedAt, forecastAt, source, condition, temperatureCelsius, minCelsius, maxCelsius, precipitationProbability(0~1|null), hourly[{at, condition, temperatureCelsius, precipitationProbability}], stale`.
- **WeatherAlternative**: `alternativeId, type(PLACE_SWAP·TIME_SHIFT·INFO), place|null, itemId|null, targetStartTime|null, activity, reason`.
- **WeatherAlternativesResult**: `alternatives[], weather, baseVersion`. 작업(Job)의 result.
- **TripPhase**: `before(daysLeft) | during(day) | after(day) | noDates`.
- **오늘 일정**: 코스 초안의 그 날 칸. 다음 일정 = 지금 시각 이후 첫 시작 시각, 없으면 없음.
