---
title: "어디로그 AI 서버 API 스펙"
status: draft
version: "0.4"
created: 2026-10-27
updated: 2026-11-02
jira: EODI-76
parent: EODI-141
sources:
  - "docs/api-spec.md (dev, 설계 제안 v0.4) — 최우선: 백엔드 계약에 맞춘다"
  - "docs/erd.dbml (dev)"
  - "EodiLog/docs/plan/jobs-foundation.md (dev)"
  - "docs/design/open-decisions-2026-10-27.md (dev)"
  - "프론트 화면 설계 (eodilog-figma-import)"
---

# 어디로그 AI 서버 API 스펙 v0.4

> 백엔드 작업 큐(worker)가 호출하는 **내부 API**다. 응답 `data`는 백엔드 [`api-spec.md`](../../docs/api-spec.md) §10 "비동기 작업 kind별 result"의 모양 그대로이므로 백엔드는 변환 없이 `jobs.result_json`에 저장할 수 있다.
> 기준 우선순위: **백엔드 API 명세(dev) → 화면 설계 → PRD.** 스펙과 코드가 다르면 스펙을 먼저 고친다.

## 0. 범위

### 0.1 백엔드 작업과 AI 엔드포인트

| 백엔드 job kind / API | AI 엔드포인트 | 응답 `data` = 백엔드 모양 |
| --- | --- | --- |
| `PLACE_EXTRACTION` | `POST /ai/v1/place-extractions` | `{resultStatus, candidates}` |
| `TRIP_RECOMMENDATION` | `POST /ai/v1/trip-recommendations` | `{items, basis, insufficientData}` |
| `ITINERARY_PROPOSAL` | `POST /ai/v1/itinerary-proposals` | `{baseVersion, reason, proposed, diff, appliedAt, canUndo}` |
| `WEATHER_ALTERNATIVES` | `POST /ai/v1/weather-alternatives` | `{alternatives, weather, baseVersion}` |
| `CHECKLIST_SUGGESTIONS` | `POST /ai/v1/checklist-suggestions` | `{items}` |
| `PHOTO_CLASSIFICATION` | `POST /ai/v1/photo-classifications` | `{photos}` |
| `VISIT_DETECTION` | `POST /ai/v1/visit-detections` | `{candidates}` |
| `GET /me/preferences`의 추론 항목 | `POST /ai/v1/preference-inferences` | `{inferredItems}` |
| `GET /me/discovery-recommendations` | `POST /ai/v1/discovery-recommendations` | `{items}` |
| `GET /me/follow-suggestions` | `POST /ai/v1/follow-suggestions` | `{items}` |

### 0.2 AI 서버가 하지 않는 일

- **작업 관리.** 작업 생성·진행률·재시도·권한 재검사는 백엔드 `jobs`가 한다. AI 서버는 요청 하나에 결과 하나를 **바로** 돌려주고 아무것도 저장하지 않는다.
- **권한·동의 판단.** 백엔드는 요청자가 볼 수 있고 활용을 허용한 데이터만 보낸다(취향 공유 범위 `EXPLICIT_ONLY/EXPLICIT_AND_INFERRED/NONE`도 백엔드가 걸러서 보낸다).
- **날씨 조회와 경로 재계산.** 날씨는 백엔드 `GET /trips/{id}/weather`, 경로 재계산은 `ROUTE_RECALCULATION`. 날씨 대안·준비물은 백엔드가 조회한 `Weather`를 입력으로 받는다.
- **최근 트렌드(`/trends/regions`), 주변 시설.** 백엔드 집계·조회.
- **ID 발급.** 백엔드가 행을 만들 때 ID를 발급한다. AI는 새 항목에 `id: null`을 쓴다. 예외: 사진 유사 묶음 `groupId`와 날씨 `alternativeId`는 AI가 UUID로 만든다(백엔드가 그 값으로 행을 만든다).

## 1. 공통 계약 (백엔드 §2와 같음)

- 경로 `/ai/v1`, JSON, **camelCase**. 사진·캡처만 `multipart/form-data`.
- 인증: `X-Internal-Token` 헤더 = 환경변수 `INTERNAL_API_TOKEN`(비어 있으면 로컬 개발로 검사 안 함).
- ID는 문자열(백엔드 UUID). 날짜시각 ISO 8601 UTC, 날짜 `YYYY-MM-DD`, 일정 시각 `HH:MM`(Asia/Seoul).
- 성공: `200 {"data": ...}`.
- 실패: `{"error":{"code":"...","message":"...","fields":[],"traceId":"..."}}`. `traceId`는 요청 헤더 `X-Trace-Id`(백엔드 공통 헤더), 없으면 서버가 만든다. 백엔드는 이 값에 `jobId`를 넣는다.

| HTTP | code | 언제 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 요청 형식 오류(`fields`는 `[{field, message}]`, 백엔드 `ErrorField`와 같음) |
| 401 | `UNAUTHENTICATED` | 내부 토큰 불일치 |
| 422 | `INPUT_LIMIT_EXCEEDED` | 캡처 11장 이상, 사진 51장 이상 |
| 422 | `UNSUPPORTED_INPUT` | 지원하지 않는 파일 형식·URL |
| 422 | `INSUFFICIENT_DATA` | 처리에 필요한 입력 부족(결과 DTO에 자료 부족 표현이 없는 작업만) |
| 422 | `UNSCHEDULABLE_ALTERNATIVE` | 적용할 수 없는 날씨 대안(`INFO`)으로 변경안 요청 |
| 503 | `PROVIDER_UNAVAILABLE` | LLM(GMS)·장소 검색·경로 공급자 장애. "결과 없음"과 구분 |
| 500 | `INTERNAL_ERROR` | 예상하지 못한 오류 |

### 1.0 백엔드 `jobs`와의 연결

백엔드 작업이 AI를 호출한 뒤 응답은 아래처럼 처리한다.

| AI 응답 | 작업 결과 | 재시도 |
| --- | --- | --- |
| 2xx | 성공, `{data}` 봉투를 벗긴 객체를 `result`로 저장 | - |
| 503, 500, 연결 실패, 호출 타임아웃 | 일시 실패(`TEMPORARY_FAILURE`) | 최초 포함 3회, 간격 30초 |
| 4xx | 실패(`EXECUTION_FAILED`) | 없음 |

- **사용자에게 사유를 보여 줄 오류는 작업 등록 전에 백엔드가 검사한다.** `jobs.error_code`에는 공통 값 4개만 저장되므로 AI의 `INSUFFICIENT_DATA` 같은 코드는 사용자에게 전달되지 않는다. 기간·장소 없음(S23), 날씨 대안 `INFO`, 입력 개수·형식은 작업 등록 전에 동기로 거부한다. AI 쪽 4xx는 이를 통과한 잘못된 입력을 막는 마지막 방어선이다.
- **시간 예산:** 백엔드 worker 제한은 60초다. 백엔드의 AI 호출 타임아웃은 50초, AI 서버는 요청 하나를 45초 안에 끝내거나 503을 돌려준다.
- **재실행:** `jobs`는 at-least-once라 같은 `jobId`로 다시 호출될 수 있다. AI 서버는 저장하는 것이 없으므로 그대로 다시 처리한다. 결과가 달라질 수 있어도(`groupId`·`alternativeId` 포함) 백엔드는 완료된 결과 하나만 저장한다.

### 1.1 공통 입력 모델 (백엔드 DTO + AI가 더 필요로 하는 선택 필드)

```jsonc
// Place = 백엔드 Place + 선택 필드 category
{ "id": "uuid", "name": "흰여울문화마을", "address": "부산 영도구 …", "latitude": 35.078, "longitude": 129.045,
  "regionId": "uuid|null", "provider": "NAVER|null", "providerPlaceId": "이름·주소 해시(AS-12)|null", "source": "PROVIDER|MANUAL",
  "category": "여행 > 관광,명소|null" }   // ★ 백엔드 places 테이블에 없음. 공급자 분류를 넘겨 달라고 요청(§11)

// Region = 백엔드 Region
{ "id": "uuid", "code": "busan-yeongdo", "name": "부산 영도구", "parentId": null, "latitude": 35.09, "longitude": 129.06 }

// ItineraryItem = 백엔드 ItineraryItem
{ "id": "uuid|null", "place": Place, "day": 1, "order": 1, "startTime": "10:00|null", "stayMinutes": 120 }

// Weather = 백엔드 Weather (확률은 0~1)
{ "placeId": "uuid", "date": "2026-11-14", "queriedAt": "…", "forecastAt": "…", "source": "…", "condition": "RAIN",
  "temperatureCelsius": 12, "minCelsius": 9, "maxCelsius": 14, "precipitationProbability": 0.7,
  "hourly": [{ "at": "2026-11-14T01:00:00Z", "condition": "RAIN", "temperatureCelsius": 11, "precipitationProbability": 0.7 }],
  "stale": false }
```

- **실내 여부:** 백엔드에 필드가 없으므로 AI가 `category`로 판단한다(카페·음식점·박물관·쇼핑·숙박 → 실내, 해수욕장·공원·산·관광명소 → 실외, 그 외 모름). 모르면 날씨 영향 판단에서 뺀다.
- **장소 동일성:** 백엔드 `place.id`가 같으면 같은 장소(D-6: 이름·좌표만 같다고 합치지 않는다).

## 2. `POST /ai/v1/place-extractions` — PLACE_EXTRACTION (S11·S12)

**요청** (`multipart/form-data`)

| 필드 | 설명 |
| --- | --- |
| `url?` | SNS 게시물·블로그 링크 |
| `captures?` | 캡처 이미지, **JPG·PNG, 최대 10장**(11장 이상 422 `INPUT_LIMIT_EXCEEDED`), 장당 15MB |
| `memo?` | 사용자 메모 |
| `regionHint?` | 여행지 이름(그룹 즐겨찾기에서 시작한 경우) |

`url`·`captures` 중 하나 이상 필수. 백엔드는 `captureAssetIds`의 파일 바이트를 그대로 전달한다.

**응답 `data`** = 백엔드 `ExtractionResult`의 `resultStatus, candidates`

```json
{
  "resultStatus": "MULTIPLE_CANDIDATES",
  "candidates": [
    { "name": "바다 앞 카페", "place": { "name": "바다 앞 카페 남천점", "address": "부산 수영구 …", "latitude": 35.14,
        "longitude": 129.11, "provider": "NAVER", "providerPlaceId": "이름·주소 해시", "category": "카페,디저트>카페" },
      "evidence": "캡처 속 간판에서 찾았어요", "confidence": 1.0 },
    { "name": "바다 앞 카페", "place": { "…민락점" }, "evidence": "캡처 속 간판에서 찾았어요", "confidence": 1.0 },
    { "name": "신기산업", "place": null, "evidence": "게시물 글에서 찾았어요", "confidence": null }
  ]
}
```

- `name`은 자료에서 찾은 **장소 언급**이다. 같은 `name`의 후보들은 같은 언급의 여러 지점이다(화면 "어느 곳인가요?").
- `place`는 공급자 장소(백엔드 resolver가 `places`에 upsert해 `place.id`를 만든다). 검색 결과가 없으면 `null`, `confidence: null`.
- `confidence`(0~1): 정규화한 언급 이름과 공급자 장소 이름의 문자열 유사도.
- `evidence`: 화면 문구 그대로 — `게시물 글에서 찾았어요` / `캡처 속 간판에서 찾았어요` / `캡처 속 글에서 찾았어요` / `메모에서 찾았어요`.

| 상황 | `resultStatus` |
| --- | --- |
| 모든 언급이 공급자 장소 1곳으로 확정(유사도 1.0인 후보가 정확히 하나) | `SUCCESS` |
| 여러 지점이거나 검색 결과 없는 언급이 있음 | `MULTIPLE_CANDIDATES` |
| 언급이 없음 | `NOT_FOUND` |
| 모든 자료를 읽지 못함(비공개 게시물, 깨진 파일) | `FAILED` |

- 링크 일부·캡처 일부를 읽지 못해도 읽은 자료로 계속한다.
- LLM 장애 → 503 `PROVIDER_UNAVAILABLE`(링크 제목만 있으면 제목으로 계속). 장소 검색 장애 → 언급은 `place: null`로 돌려준다.
- SSRF 방지(내부망 주소 차단, 리다이렉트마다 검사), 캡처는 EXIF를 지우고 1600px로 줄여 LLM에 보낸다. 장소 이름은 적힌 그대로(업종을 붙이지 않음).

**검증:** T-01-1 링크 글·캡처 간판의 장소 2곳 / T-01-2 같은 이름 3지점 → `MULTIPLE_CANDIDATES` / T-01-3 장소 없음 → `NOT_FOUND` / T-01-4 사설 IP → 링크 실패 / T-01-5 403 링크+정상 캡처 → 캡처 결과 / T-01-6 403 링크만 → `FAILED` / T-01-7 검색 장애 → `place:null` / T-01-8 같은 장소 중복 언급 합침 / T-01-9 LLM 이미지에 EXIF 없음 / T-01-10 WebP 422 `UNSUPPORTED_INPUT`, 11장 422 `INPUT_LIMIT_EXCEEDED`

## 3. `POST /ai/v1/preference-inferences` — 취향 행동 추론 (S03)

**요청**

```json
{ "userId": "uuid", "savedPlaces": [Place], "explicitItems": [{"key": "카페", "value": "카페"}], "rejectedKeys": ["야경"] }
```

- `savedPlaces`: 본인 개인 즐겨찾기 + 본인이 그룹에 담은 장소. `rejectedKeys`: `DELETE /me/preferences/inferred/{key}`로 거부한 키(`preference_rejections`).

**응답 `data`**: `{ "inferredItems": [{"key": "바다", "value": "바다"}] }` — 백엔드 `user_preferences(source=INFERRED)`에 그대로 저장. `key`·`value` 모두 취향 태그(화면 S03 선택지: 바다·맛집·카페·산·도시·사진·산책·야경·휴식·골목).

- 저장 장소 5곳 미만 → 422 `INSUFFICIENT_DATA`. 전체의 30% 이상·2곳 이상에서 나온 태그, 최대 5개. 직접 입력·거부 키는 뺀다.

**검증:** T-02-1 카페 4·해변 3 → 카페·바다 / T-02-2 직접 입력 제외 / T-02-3 거부 키 제외 / T-02-4 3곳 → 422 / T-02-5 LLM 장애에도 규칙 결과

## 4. `POST /ai/v1/trip-recommendations` — TRIP_RECOMMENDATION (S21)

**요청**

```json
{
  "trip": { "id": "uuid", "startDate": "2026-11-14", "endDate": "2026-11-15", "destinationRegionIds": ["uuid"] },
  "members": [{ "memberId": "uuid", "nickname": "세은", "explicit": ["카페", "바다"], "inferred": [] }],
  "savedPlaces": [SavedPlace],
  "candidatePlaces": [Place],
  "regions": [Region],
  "excludePlaceIds": []
}
```

- `members[].explicit/inferred`: 그 여행에서 **실제로 쓸 수 있는** 취향만(백엔드가 `effectiveScope`로 걸러 보냄).
- `savedPlaces`: 백엔드 `SavedPlace`(`{place, savedBy:[{memberId, memo}], savedCount}`).
- `candidatePlaces`: 그룹 즐겨찾기 밖 맛집·스팟 후보. ★ 백엔드가 여행지 주변 공급자 검색으로 채운다(§11). 없으면 스팟 추천 없음.
- `regions`: `savedPlaces`·`candidatePlaces`의 `regionId`에 해당하는 `Region`.

**응답 `data`** = 백엔드 `RecommendationResult`의 `items, basis, insufficientData`

```json
{
  "items": [
    { "type": "REGION", "region": Region, "place": null, "reason": "겹친 장소 흰여울문화마을이 있는 지역이에요" },
    { "type": "PLACE", "region": null, "place": Place, "reason": "바다와 카페 취향이 겹쳐요" }
  ],
  "basis": { "sharedPlaceCount": 3, "usedMemberCount": 3 },
  "insufficientData": false
}
```

- 최소 조건: 그룹 즐겨찾기 3곳, 취향 있는 멤버 2명(S21). 미달 → `insufficientData: true`, `items: []`(200).
- 겹침 = 저장자 2명 이상. **REGION**: 즐겨찾기를 `regionId`로 묶어 점수(겹침×3 + 장소 수 + 취향 일치), 최대 3곳. **PLACE**: 후보 중 즐겨찾기·`excludePlaceIds` 제외, 멤버 취향 일치(직접 2·추론 1) + 겹친 장소 1km 이내 +1, 최대 5곳.
- 겹침이 없으면 REGION 없이 멤버마다 한 곳씩, `reason`은 "○○의 △△ 취향으로 골랐어요".
- `reason`: REGION은 규칙 문장. PLACE는 LLM이 계산된 일치(별칭 M1·M2)로만 쓰고, 실패·거짓 합의 표현이면 규칙 문장("맛집을 고른 두 사람에게 맞아요").
- `basis.sharedPlaceCount` = 겹친 장소 수, `usedMemberCount` = 취향을 반영한 멤버 수.

**검증:** T-03-1 겹침·취향 반영 / T-03-2 같은 `place.id` 저장자 합침 / T-03-3 겹침 없음 → 멤버별 / T-03-4 취향 없는 멤버 이름 미노출 / T-03-5 미달 → `insufficientData` / T-03-6 즐겨찾기 장소는 PLACE로 재추천 안 함 / T-03-7 제외 목록 / T-03-8 LLM 장애 → 규칙 문장 / T-03-9 일부만 맞으면 "모두·함께" 금지

## 5. `POST /ai/v1/itinerary-proposals` — ITINERARY_PROPOSAL (S23·S26·S29)

**요청** = 백엔드 `ProposalWrite` + AI가 필요한 자료

```json
{
  "reason": "INITIAL",
  "expectedVersion": 3,
  "trip": { "id": "uuid", "startDate": "2026-11-14", "endDate": "2026-11-15", "destinationRegionIds": ["uuid"] },
  "places": [Place],
  "current": { "items": [ItineraryItem], "legs": [RouteLeg] },
  "defaultTransportMode": "TRANSIT",
  "excludedPlaceIds": [],
  "selectedAlternative": null
}
```

| `reason` | 하는 일 | 필요한 입력 |
| --- | --- | --- |
| `INITIAL` | 모은 장소로 날짜별 코스 생성 | `places`, 기간 |
| `PLACE_REMOVED` | 빠진 장소를 지우고 그날 남은 순서로 시각·구간 재계산 | `current`, `excludedPlaceIds` 필수 |
| `WEATHER` | 고른 날씨 대안 적용(`PLACE_SWAP`: 장소 교체, `TIME_SHIFT`: 시각 이동) | `current`, `selectedAlternative` 필수. `INFO`면 422 `UNSCHEDULABLE_ALTERNATIVE` |

**응답 `data`** = 백엔드 `ItineraryProposal`의 결과 필드

```json
{
  "baseVersion": 3,
  "reason": "INITIAL",
  "proposed": {
    "items": [{ "id": null, "place": Place, "day": 1, "order": 1, "startTime": "10:00", "stayMinutes": 120 }],
    "legs": [{ "fromItemId": null, "toItemId": null, "day": 1, "fromOrder": 1, "toOrder": 2, "transportMode": "TRANSIT",
               "durationSeconds": 1320, "distanceMeters": null, "geometry": null, "status": "AVAILABLE", "queriedAt": "…" }]
  },
  "diff": { "removedPlaceIds": [], "addedPlaceIds": ["uuid"], "description": "1일차 3곳, 2일차 2곳으로 짰어요" },
  "appliedAt": null,
  "canUndo": false
}
```

- `baseVersion` = 요청 `expectedVersion`. 적용(`apply`)·버전 검사·되돌리기는 백엔드.
- 기존 항목은 `id`를 유지, 새 항목은 `id: null`. 구간은 백엔드 `ItineraryWrite.legs`처럼 `day/fromOrder/toOrder`로도 가리킨다(새 항목은 ID가 없으므로).
- **구간별 수단**(D-13): 기본은 `defaultTransportMode`. 대중교통 경로가 없을 만큼 가까우면 그 구간은 `WALK`. 이동 시간은 공급자 값만, 못 구하면 `durationSeconds: null`, `status: UNAVAILABLE`(0초·직선거리 금지). 지도 선(`geometry`)·거리는 백엔드 `ROUTE_RECALCULATION`이 채운다.
- 날짜 배분: 일수만큼 가까운 장소끼리, 하루 최대 5곳, 고르게. 넘치는 장소는 `diff.description`에 "N곳은 넣지 못했어요". 식당은 점심 12:00·저녁 18:00, 하루 10:00~21:00. 여러 여행지(`destinationRegionIds`)는 지역별로 날짜를 나눈다(Q-6 결정).
- 선행 조건(S23): 기간 없음·장소 없음 → 422 `INSUFFICIENT_DATA`(`fields`에 `trip.startDate`/`places`).

**검증:** T-04-1 1박 2일 5곳 → 2일 배분, 각 1회 / T-04-2 기간 없음 422 / T-04-3 구간 실패 → `null`·`UNAVAILABLE` / T-04-4 당일 8곳 → 5곳, 설명에 3곳 / T-04-5 식당 점심 / T-04-6 근거리 대중교통 없음 → 그 구간 `WALK` / T-04-7 `PLACE_REMOVED` → 제외 장소 없음·남은 순서 유지·`removedPlaceIds` / T-04-8 `WEATHER` `TIME_SHIFT` → 같은 장소 시각 이동, `PLACE_SWAP` → 장소 교체 / T-04-9 `INFO` → 422 / T-04-10 요청 `places` 밖 장소 없음

## 6. `POST /ai/v1/weather-alternatives` — WEATHER_ALTERNATIVES (S26)

**요청**

```json
{
  "date": "2026-11-14", "placeId": "uuid", "expectedVersion": 3,
  "weather": Weather,
  "dayItems": [ItineraryItem],
  "alternativePool": [{ "place": Place, "openStatus": { "value": "OPEN|CLOSED|UNKNOWN", "checkedAt": "…|null" } }],
  "defaultTransportMode": "TRANSIT"
}
```

- `weather`: 백엔드가 조회한 대상 장소의 `Weather`. `dayItems`: 그날 코스. `alternativePool`: 대상 주변 실내 후보와 영업 정보(백엔드가 시설·장소 공급자로 채움).

**응답 `data`** = `{alternatives, weather, baseVersion}`

```json
{
  "alternatives": [
    { "alternativeId": "uuid", "type": "TIME_SHIFT", "place": null, "itemId": "uuid", "targetStartTime": "14:00",
      "activity": "해운대 해변을 오후로 옮기기", "reason": "비 그친 뒤 14:00 · 12시부터 그쳐요 (예보)" },
    { "alternativeId": "uuid", "type": "PLACE_SWAP", "place": Place, "itemId": "uuid", "targetStartTime": null,
      "activity": "해운대 실내 수족관", "reason": "도보 8분 · 영업 중(09:35 확인)" },
    { "alternativeId": "uuid", "type": "INFO", "place": null, "itemId": null, "targetStartTime": null,
      "activity": "우산과 우비 챙기기", "reason": "가까운 실내 대안이 없어요" }
  ],
  "weather": Weather,
  "baseVersion": 3
}
```

- 비 구간: `hourly.precipitationProbability ≥ 0.6`이 이어지는 시간. 대상 장소가 실외이고 그 시각이 비 구간일 때만 대안을 낸다. 아니면 `alternatives: []`.
- `TIME_SHIFT`: 비 그친 뒤 그날 다른 일정과 겹치지 않는 첫 시각. `PLACE_SWAP`: 실내·`CLOSED` 아님, 가까운 순 최대 3곳, 이동 시간은 `reason`에. `INFO`: 둘 다 없을 때 준비물 안내(코스 변경 불가).
- 날씨 수치·영업 정보는 입력값만 쓴다.

**검증:** T-06-1 10시 실외·12시 그침·14시 빔 → `TIME_SHIFT 14:00` / T-06-2 빈 시간 없음 → `TIME_SHIFT` 없음 / T-06-3 `CLOSED` 제외·가까운 순 / T-06-4 실내 후보 없음 → `INFO` / T-06-5 후보 밖 장소 없음 / T-06-6 경로 실패 → 대안 유지 / T-06-7 실내·비 없는 시간 → `[]`

## 7. `POST /ai/v1/checklist-suggestions` — CHECKLIST_SUGGESTIONS (S27)

**요청**

```json
{
  "jobId": "uuid", "trip": { "startDate": "2026-11-14", "endDate": "2026-11-15" },
  "weather": [Weather], "items": [ItineraryItem],
  "existingItems": [{ "label": "멀미약 2개", "source": "MANUAL|AI", "modifiedByUser": true }],
  "deletedLabels": ["손수건"]
}
```

- 공동 목록 하나(Q-8b 결정). `deletedLabels`: 사용자가 지운 항목 — 다시 제안하지 않는다(백엔드 "삭제한 항목 강제 부활 금지").

**응답 `data`**: `{ "items": [{ "label": "우산", "reason": "오전 비 70%", "sourceJobId": "uuid" }] }` — `sourceJobId` = 요청 `jobId`.

- 규칙: 비 ≥ 0.6 → 우산·우비 / 최저 ≤ 5° → 두꺼운 외투·손난로 / 최고 ≥ 28° → 선크림·모자 / 걷는 장소 2곳+ → 편한 운동화 / 하루 8시간+ → 보조배터리 / 바다 → 여벌 양말 / 기본 신분증·충전기 / 1박+ 세면도구·갈아입을 옷. LLM 추가 최대 2개.
- 기존·삭제 항목과 같거나 포함 관계면 제안하지 않는다.

**검증:** T-07-1 비 / T-07-2 걷는 일정 / T-07-3 기존 항목 / T-07-4 포함 관계(`멀미약 2개`) / T-07-5 지운 항목 재제안 안 함 / T-07-6 LLM 장애 → 규칙

## 8. 사진

### 8.1 `POST /ai/v1/photo-classifications` — PHOTO_CLASSIFICATION (S31·S32)

**요청** (`multipart/form-data`): `meta` = `{"photoIds": ["uuid", …]}`, `files` = 같은 순서의 사진. **JPG·PNG·HEIC, 최대 50장**(51장 이상 422 `INPUT_LIMIT_EXCEEDED`), 장당 15MB.

**응답 `data`**

```json
{ "photos": [
  { "photoId": "uuid", "status": "SUCCEEDED", "topics": ["LANDSCAPE"], "groupId": "uuid|null", "errorCode": null },
  { "photoId": "uuid", "status": "FAILED", "topics": [], "groupId": null, "errorCode": "IMAGE_DECODE_FAILED" }
] }
```

- 주제: `LANDSCAPE` 풍경, `FOOD` 음식, `PEOPLE` 사람, `OTHER` 기타. SigLIP2 점수가 가장 높은 하나.
- 유사 묶음: 코사인 유사도 ≥ 0.94인 사진끼리 묶고 2장 이상 묶음에 새 `groupId`(UUID). 원본 삭제·대표 선정 없음.
- 사진마다 독립 처리, 실패한 사진만 `FAILED`. 모델 장애 → 503.
- 사진은 외부로 보내지 않는다(GPU 서버·EC2 로컬 모델).

**검증:** T-08-1 정상 2 + 깨진 1 → 2장 성공 / T-08-2 연속 사진 한 묶음 / T-08-3 다른 사진 묶이지 않음 / T-08-4 HEIC 처리 / T-08-5 51장 422 / T-08-6 모델 장애 503

### 8.2 `POST /ai/v1/visit-detections` — VISIT_DETECTION (S31·S33)

백엔드가 업로드 때 추출한 비공개 메타데이터(촬영 시각·위치)로 판단한다. 사진 파일은 받지 않는다.

**요청**

```json
{
  "tripStartDate": "2026-11-14",
  "photos": [{ "photoId": "uuid", "uploaderMemberId": "uuid", "capturedAt": "…|null", "latitude": 35.15, "longitude": 129.16 }],
  "items": [ItineraryItem]
}
```

**응답 `data`**: `{ "candidates": [{ "memberId": "uuid", "placeId": "uuid", "visitedAt": "…", "evidencePhotoIds": ["uuid"] }] }`

- 위치가 있는 사진을 같은 날짜(`tripStartDate + day - 1`) 코스 장소 중 300m 안 가장 가까운 곳에 붙인다. 없으면 날짜 무관 300m 안. 업로더(`memberId`)·장소별로 묶고 `visitedAt` = 가장 이른 촬영 시각.
- 후보일 뿐 방문 확정이 아니다(백엔드 `visit_candidates`, 사용자 확인). 사진 속 다른 사람을 방문자로 정하지 않는다.

**검증:** T-08-7 100m 안·같은 날 → 후보 / T-08-8 2km 밖 → 없음 / T-08-9 위치 없는 사진 무시 / T-08-10 업로더별로 따로

## 9. 추천 (동기 API)

### 9.1 `POST /ai/v1/discovery-recommendations` — 좋아요한 여행과 비슷해요 (S05·N7)

**요청**: `{ "liked": [{"type": "FEED|PLACE", "id": "uuid", "regionName": "강원 강릉", "tags": [], "placeCategories": []}], "candidates": [같은 모양], "limit": 10 }`

**응답 `data`**: `{ "items": [{ "type": "PLACE", "feedId": null, "placeId": "uuid", "reason": "좋아요한 여행과 비슷해요" }] }` → 백엔드가 `DiscoveryItem`(`feed`/`place` 객체)으로 채운다.

- 좋아요 0개 → 422 `INSUFFICIENT_DATA`. 태그×2 + 같은 시·도 2 + 분류 일치 1.

### 9.2 `POST /ai/v1/follow-suggestions` — 친구 추천 (S44)

**요청**: `{ "userId": "uuid", "myPublicTastes": [], "candidates": [{"userId": "uuid", "publicTastes": [], "publicTripCount": 0}], "limit": 10 }` — 팔로우 중·숨김(`suggestion_dismissals`)·차단은 백엔드가 뺀다.

**응답 `data`**: `{ "items": [{ "userId": "uuid", "reason": "공개 취향이 같아요 · 바다, 카페" }] }` → 백엔드 `{user, reason}`.

- 공개 취향 일치×2 + min(공개 여행 수, 5)×0.5. 일치가 없으면 "공개 여행 N개를 올렸어요". 관계·연령은 받지 않는다.

## 10. 외부 의존성

| 의존성 | 쓰는 곳 | 장애 시 |
| --- | --- | --- |
| GMS `gpt-5.6-luna` | 장소 언급·캡처 읽기, 추천 문장, 준비물 추가 | 추출 503, 나머지는 규칙 결과 |
| 네이버 지역 검색(NAVER API HUB) | 장소 추출의 장소 검색 | `place: null` |
| 카카오 길찾기(자동차·도보·대중교통) | 코스 변경안의 구간 시간, 날씨 대안 이동 시간 | 구간 `UNAVAILABLE` |
| SigLIP2 `ViT-B-32-SigLIP2-256` (로컬) | 사진 분류·묶음 | 503 |

## 11. 백엔드에 요청할 것

| # | 요청 | 이유 |
| --- | --- | --- |
| 1 | `places`에 공급자 분류(`category`, 네이버 `category`) 저장·전달 | 취향 일치, 실내 판단, 식사 시간 배치에 필요 |
| 2 | 추천 후보 장소(`candidatePlaces`)를 여행지 주변 공급자 검색으로 채워 전달 | AI는 장소를 만들지 않는다 |
| 3 | 날씨 대안 후보(`alternativePool`)와 영업 정보 전달 | 같은 이유 |
| 4 | `RecommendationResult`에 멤버별 취향 일치(화면 S21 `세 바다` 칩)와 "○○의 취향으로" 구분 필드 추가 검토 | 지금 DTO에는 `reason` 문장뿐 |
| 5 | `follow-suggestions` 응답에 취향 태그 칩(S44) 필드 추가 검토 | 지금은 `reason`에 문장으로 넣음 |
| 6 | AI 호출 타임아웃 50초, `X-Internal-Token`, `X-Trace-Id`(`jobId`) 전달 | §1.0 시간 예산 |
| 7 | §1.0의 사전 검사를 작업 등록 전에 수행 | 공통 오류 코드 4개로는 사유를 화면에 보여 줄 수 없다 |
| 8 | `regions`의 코드 체계(Q-8)·시드 시점과 좌표 제공 범위 공유 | 현재 운영 자료가 없고 좌표는 NULL 가능. 추천·코스가 사용 |
| 9 | S21 "모은 장소" 수를 `basis`에 추가할지 결정(예: `savedPlaceCount`) | 디자인 결정의 숫자 칸 3개 중 지금 `basis`에 없는 값 |
| 11 | 네이버 장소 ID 규칙 합의(-162). 응답에 고유 ID가 없어 AI는 AS-12로 만든다. 백엔드도 같은 값을 써야 같은 장소로 저장된다. 저장 약관도 함께 확인 | 추출 결과를 즐겨찾기에 넣을 때 필요 |
| 10 | 이동 시간 공급자 결정. 2026-11-03 네이버 확정과 AI의 카카오 길찾기가 어긋나 재검토 필요 | AI 변경안의 구간 시간과 백엔드 `ROUTE_RECALCULATION`이 같은 값을 내야 한다 |

## 12. 임시 가정

| ID | 내용 |
| --- | --- |
| AS-1 | 장소 동일성 = 백엔드 `place.id`(D-6) |
| AS-2 | 취향 어휘 = S03 선택지 10개 |
| AS-3 | 추론: 저장 5곳 이상, 30%·2곳 이상, 최대 5개 |
| AS-4 | 추천: 최소 장소 3·취향 멤버 2, REGION 3·PLACE 5 |
| AS-5 | 코스: 10:00~21:00, 하루 5곳, 식사 12:00·18:00, 머무는 시간 카페 60·식당 90·관광 120·기타 90분, 구간 실패 시 다음 일정 30분 여유 |
| AS-6 | 날씨: 비 기준 0.6, 도보 대안 1.2km |
| AS-7 | 사진: 주제 4종, 유사 0.94, 방문 판정 300m |
| AS-8 | 모델: GMS `gpt-5.6-luna`, 사진 SigLIP2 `ViT-B-32-SigLIP2-256` |
| AS-9 | 시간 예산: AI 요청 45초, 백엔드 호출 50초, worker 60초 |
| AS-10 | 근거리 도보 대체: 대중교통 경로가 없고 직선 1km 이내일 때만 `WALK`. 그보다 멀면 `UNAVAILABLE`. 공급자 장애는 거리와 무관하게 `UNAVAILABLE` |
| AS-11 | 장소 추출: 링크·메모에서 찾았다는 이름은 그 글에 실제로 있을 때만 받는다(글자·공백 차이는 정규화). 언급은 요청당 20개까지, 링크 읽기는 전체 5초, 입력 길이는 `url` 2048자·`memo` 500자·`regionHint` 50자 |
| AS-12 | 네이버 장소 ID: `sha256(정규화한 이름 + 줄바꿈 + 정규화한 도로명 주소, 없으면 지번 주소)`의 16진수. 정규화는 NFKC·소문자·글자와 숫자만. 주소 없는 결과는 뺀다. 가게 이름이나 주소가 바뀌면 다른 장소가 된다 |
| AS-13 | 취향 추론: 분류나 이름 규칙으로 못 고른 장소만 LLM에 이름·분류를 보낸다(요청당 100곳, 장소당 2태그). 같은 수의 태그는 S03 선택지 순서. `category`가 없으면 이름 규칙(해수욕장·해변·카페·커피·공원·둘레길)만 쓰이므로 LLM 장애 시 결과가 줄어든다 |

## 13. 변경 이력

| 버전 | 내용 |
| --- | --- |
| 0.1 | PRD v0.4 기준 초안 |
| 0.2 | 화면 설계 기준 개편 |
| 0.3 | **백엔드 API 명세(dev v0.4)에 맞춤.** 응답을 `{data}`/`{error}`와 job kind별 result 모양으로, camelCase, 동기 처리(작업 관리는 백엔드), 날씨 요약·날씨 조회 제거, 코스 재조정(`PLACE_REMOVED`·`WEATHER`)·방문 판정 추가, 구간별 수단, 캡처 10장·사진 50장·HEIC, 준비물 삭제 항목 재제안 금지, 강수확률 0~1 |
| 0.4 | **백엔드 `jobs` 기반(EODI-135)에 맞춤.** 추적 헤더를 `X-Trace-Id`로 변경, 응답 처리표, 사전 검사 위치, 시간 예산, 재실행 동작 추가. 백엔드 요청 7~10 추가 |
| 0.5 | **장소 검색을 카카오에서 네이버로 교체**(2026-11-03 기술 확정). 장소 ID 규칙 AS-12 추가 |
