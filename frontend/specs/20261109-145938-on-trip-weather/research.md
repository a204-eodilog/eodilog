# Research: 여행 중과 날씨 대안

## R1 여행 단계
- Decision: 기기 날짜로 startDate 전이면 before, 기간 안이면 during(N일차), 지났으면 after(마지막 날), 날짜 없으면 noDates.

## R2 날씨 문구
- 요약: 비·눈 확률 30% 이상인 시간이 오전에 몰리면 "오전 비 70%", 오후면 "오후 비 N%". 아니면 상태 이름("맑음", "흐림").
- 비 그침: 비 시간 뒤 처음 30% 아래로 내려가는 시각 "12시부터 그쳐요".
- 기온: "최고 14° 최저 9°". 조회 시각: "HH:MM 조회".
- 관측·예보: 지난 시각 관측, 다가올 시각 예보(Q-10-2).

## R3 비 영향 일정
- Decision: 오늘 일정 중 시작 시각의 비 확률이 50% 이상인 첫 일정(Q-10-3).

## R4 작업
- 날씨 대안: POST weather-alternatives → GET /jobs/{jobId}의 result(WEATHER_ALTERNATIVES). 코스의 getJob과 waitForJob을 쓴다.
- 변경안: POST itinerary/proposals {reason: WEATHER, expectedVersion, sourceWeatherJobId, selectedAlternativeId} → GET proposals/{jobId}(getAutoCourse). 끝나면 시트.

## R5 준비물
- GET /trips/{tripId}/checklist로 수만 센다. 실패하면 수 없이. [준비물에 넣기]는 POST /trips/{tripId}/checklist {label} 두 번(우산, 우비).
