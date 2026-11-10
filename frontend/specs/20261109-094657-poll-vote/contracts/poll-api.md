# Contract: 투표 API (앱이 쓰는 모양)

기준: 백엔드 `poll/controller/PollController.java`, `poll/dto`, api-spec §6·§10. 응답은 `DataResponse {data}`, 목록은 `PageResponse {data, page}`.

| 함수 | 요청 | 응답 | 오류 |
|------|------|------|------|
| `getPolls(tripId, signal?)` | GET `/trips/{tripId}/polls?limit=20` | `Poll[]` 첫 페이지 | 404 TRIP_NOT_FOUND |
| `getPoll(tripId, pollId, signal?)` | GET `/trips/{tripId}/polls/{pollId}` | `Poll` | 404 TRIP_NOT_FOUND, POLL_NOT_FOUND |
| `createPoll(tripId, body)` | POST `/trips/{tripId}/polls` `{type, title, candidates, closesAt}` | `Poll` 201 | 400 VALIDATION_ERROR fields title, candidates, closesAt |
| `replaceBallot(tripId, pollId, candidateIds, expectedVersion)` | PUT `.../ballot` | `Poll` | 409 POLL_CLOSED, VERSION_CONFLICT, 400 candidateIds |
| `addCandidate(tripId, pollId, candidate, expectedVersion)` | POST `.../candidates` | `Poll` 201 | 409 POLL_CLOSED, VERSION_CONFLICT, 400 candidate |
| `getPlace(placeId)` | GET `/places/{placeId}` | `Place` | 404 |
| `getTripSavedPlaces(tripId, cursor?)` | GET `/trips/{tripId}/saved-places?filter=ALL&limit=100` | `SavedPlacePage {items, totals, page}` 감싸지 않음 | 404 TRIP_NOT_FOUND |

`candidates`의 한 항목은 `{regionId}` 또는 `{placeId}` 하나만 담는다. `Idempotency-Key`는 보내지 않는다(요구하지 않는 API).
