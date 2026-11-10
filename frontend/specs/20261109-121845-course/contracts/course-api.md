# Contract: 코스 API

모든 경로 앞 `/api/v1`, 응답 `DataResponse {data}`.

| 동작 | 요청 | 성공 | 오류 | 백엔드 |
|---|---|---|---|---|
| 코스 조회 | GET /trips/{tripId}/itinerary | Itinerary | 404 TRIP_NOT_FOUND | 있음 |
| 전체 교체 | PUT /trips/{tripId}/itinerary ItineraryWrite | Itinerary | 409 VERSION_CONFLICT, 422 INVALID_ROUTE_LEGS, 400 | 있음 |
| 자동 추천 요청 | POST /trips/{tripId}/itinerary/proposals `{reason:'INITIAL', expectedVersion, defaultTransportMode?}` | 202 JobRef | 409 | 없음 → 가짜 서버 |
| 자동 추천 조회 | GET /trips/{tripId}/itinerary/proposals/{jobId} | ItineraryProposal | 404 | 없음 → 가짜 서버 |
| 다시 계산 | POST /trips/{tripId}/itinerary/routes/recalculate `{expectedVersion}` | 202 JobRef | 409 | 없음 → 가짜 서버 |
| 작업 조회 | GET /jobs/{jobId} | Job | 404 | 있음 |
| 그룹 즐겨찾기 | GET /trips/{tripId}/saved-places?limit=100&cursor | `{items, totals, page}` 감싸지 않음 | 404 | 있음 |
| 기간 넣기 | PATCH /trips/{tripId} `{expectedVersion, startDate, endDate}` | Trip | 409 | 있음 |
