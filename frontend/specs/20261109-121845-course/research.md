# Research: 코스 짜기·보기

## R1. 초안과 저장 본문
- **Decision**: 서버 Itinerary → CourseDraft `{ baseVersion, days: DraftItem[][], modes: Record<legKey, TransportMode> }`. DraftItem은 `{ key, id?, place, startTime, stayMinutes }`. 구간 수단은 "앞 항목 key → 뒤 항목 key" 쌍으로 기억한다. 저장할 때 날마다 order를 1부터 다시 매기고, 인접 쌍마다 구간을 하나 만들며 기억한 수단이 없으면 대중교통.
- **Rationale**: 서버 규칙(인접 쌍마다 정확히 하나, order 빈틈없음)을 초안 모양이 자연히 지키게 해 422가 날 수 없다.
- **Alternatives**: 서버 모양 그대로 고치기(순서 바꿀 때마다 legs를 맞춰야 해 실수 여지).

## R2. 충돌과 두 번 누르기
- **Decision**: [완료]는 ref로 막아 한 번만 보낸다. 409면 최신 코스를 받아 초안을 다시 채우고 안내, 422면 초안을 두고 안내. 바뀐 게 없으면(sameContent) 보내지 않는다.

## R3. 자동 추천
- **Decision**: POST proposals `{reason: INITIAL, expectedVersion}` → JobRef → GET proposals/{jobId}를 1.5초 간격, 1분 넘으면 실패. 결과 proposed(CourseContent)를 초안으로 바꿔 '추천안'으로 보인다. 저장 전까지 지금 코스는 바뀌지 않는다(apply 대신 [완료]에서 PUT). 실서버 404·연결 오류는 실패.
- **Rationale**: apply는 11번 주제 S29 흐름. 여기서는 결과를 초안 재료로만 쓴다.

## R4. 이동 시간 다시 계산
- **Decision**: POST routes/recalculate `{expectedVersion}` → JobRef → GET /jobs/{jobId} 기다림 → 성공이면 코스 다시 받기. 실패면 카드 유지 + 안내. 초안이 저장 전이면 요청하지 않고 안내.

## R5. 지도
- **Decision**: 공통 MapView 안에 고른 날의 MapMarker(label "1 해운대 해변")와 RoutePath(NaverMapPathOverlay, geometry가 있는 구간만). 웹은 MapView가 대체 상자라 RoutePath.web은 null.

## R6. 기간 넣기
- **Decision**: react-native-calendars Calendar(markingType period)를 화면 안에 두고 [당일]·[1박 2일]·[2박 3일] 칩은 시작일 기준 끝날을 정한다. [다음]은 PATCH /trips/{id} `{expectedVersion, startDate, endDate}` 후 여행 캐시 갱신.

## R7. 날짜별 지역
- **Decision**: 화면 상태 `dayRegion: Record<day, regionId>`. 처음 값은 그 날 장소 지역 다수결, 없으면 여행지 순서를 날짜에 고르게 나눔. 직접 만들기 칩은 그 지역 장소를 앞에 둔다.
