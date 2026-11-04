# 서버 API: 이 명세가 쓰는 것

기준: 백엔드 코드(`EodiLog/src/main/java`, 2026-11-03, 2026-11-04 다시 확인). 경로는 `/api/v1` 뒤. 모든 요청에 `Authorization: Bearer`.

## 공통

| 항목 | 규칙 |
| --- | --- |
| 성공 | `{ data: T }`. 목록은 `{ data: T[], page: { nextCursor, hasNext } }` |
| 실패 | `{ error: { code, message, fields: [{ field, message }], traceId } }`. `fields`는 항상 배열. 헤더 `X-Trace-Id`도 같은 값 |
| 목록 | `cursor?`, `limit`(기본 20, 1~100) |
| 모르는 필드 | 요청에 넣으면 400 `VALIDATION_ERROR` |
| 프로필 미완성 | `GET/PATCH /me` 외 모든 요청이 403 `PROFILE_INCOMPLETE` |
| 토큰 만료 | 401 `UNAUTHENTICATED` → `src/api/client.ts`가 갱신 한 번 후 재요청(이미 있음) |

## GET /me/trips

- Query: `status?`(PLANNING·ONGOING·COMPLETED, 쓰지 않음), `cursor?`, `limit?`(기본 20, 1~100)
- 200: `Page<Trip>`. 만든 순서 최신부터. 참여 중이고 지우지 않은 여행만
- 앱은 `limit=100`으로 `hasNext`가 false가 될 때까지 받는다(research R7)
- `/trips`에는 목록 GET이 없다. 목록은 이 경로뿐이다

## POST /trips

- Header: `Idempotency-Key`(1~100자, 필수)
- Body: `{ title, startDate?, endDate?, destinationRegionIds? }`
- 201: `{ data: Trip }`

| 응답 | 앱 동작 |
| --- | --- |
| 201 | 상세로 `replace`, 입력 비움, 목록 캐시 무효화 |
| 400 `VALIDATION_ERROR` | `fields.title`이면 이름 칸 아래 문구, 그 밖에는 실패 안내 |
| 403 `PROFILE_INCOMPLETE` | 프로필 미완성 시트 |
| 409 `REQUEST_IN_PROGRESS` | 1초 뒤 같은 키로 한 번 더 |
| 409 `IDEMPOTENCY_KEY_REUSED` | 입력이 바뀐 것. 새 키로 다시 보낼 수 있게 실패 안내 (정상 흐름에서는 생기지 않음) |
| 네트워크·시간 초과·5xx | 실패 안내 + 다시 시도(같은 키) |

같은 키 + 같은 본문은 24시간 동안 처음 결과를 다시 준다(201).

## GET /trips/{tripId}

- 200: `{ data: Trip }`
- 404 `TRIP_NOT_FOUND`: 참여하지 않음·나감·지움 → "볼 수 없는 여행이에요"
- 400(잘못된 id 형식)도 같은 안내

## GET /regions?query=

- `query` 필수, 공백 제거 후 1~200자. 이름 부분 일치
- 200: `Page<Region>`

## GET /regions/{regionId}

- 200: `{ data: { region: Region, introduction: null, representativePlaces: [], partialErrors: [] } }`. 이 명세는 `region`만 쓴다
- 404 `REGION_NOT_FOUND`: 이름 자리에 "알 수 없는 지역"

## Trip 예시

```json
{
  "id": "0193…",
  "title": "겨울 여행",
  "startDate": "2026-11-14",
  "endDate": "2026-11-15",
  "destinationRegionIds": ["0192…"],
  "status": "PLANNING",
  "currency": "KRW",
  "ownerMemberId": "0193…",
  "members": [
    {
      "id": "0193…",
      "user": { "id": "…", "nickname": "영광", "profileImageUrl": null, "accountVisibility": "PUBLIC", "followingStatus": "NONE", "followedByStatus": "NONE" },
      "role": "OWNER",
      "status": "ACTIVE",
      "joinOrder": 1,
      "joinedAt": "2026-11-03T05:00:00Z",
      "leftAt": null
    }
  ],
  "version": 0,
  "expenseVersion": 0
}
```
