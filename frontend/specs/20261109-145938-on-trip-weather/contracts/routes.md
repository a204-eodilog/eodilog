# Routes and API: 여행 중과 날씨 대안

| 주소 | 쓰임 |
|---|---|
| /trips/[tripId]/today | S25 여행 중. S17 '여행 중' |
| /trips/[tripId]/weather | S26 날씨 대안. S25 [날씨 대안 보기], 도구 '날씨 대안' |
| /dev/on-trip?state= | 미리보기: during, no-course, before, weather-fail, alt, alt-made, alt-none, alt-weather-fail |

## API
- GET /trips/{tripId}/weather?date=YYYY-MM-DD&placeId= → `{ data: Weather }`
- POST /trips/{tripId}/weather-alternatives `{date, placeId, expectedVersion}` → 202 JobRef
- GET /jobs/{jobId} → Job, result는 WEATHER_ALTERNATIVES
- POST /trips/{tripId}/itinerary/proposals `{reason:'WEATHER', expectedVersion, sourceWeatherJobId, selectedAlternativeId}` → JobRef, GET .../proposals/{jobId}
- GET /trips/{tripId}/checklist, POST /trips/{tripId}/checklist `{label}`

## 테스트 모드 조작
- `__devMock.weather.failNext()`: 다음 날씨 조회 실패
- `__devMock.weather.noAlternativesNext()`: 다음 날씨 대안을 빈 목록으로
