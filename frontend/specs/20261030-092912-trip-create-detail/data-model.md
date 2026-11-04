# Data Model: 여행 만들기와 여행 상세

서버 응답 그대로의 타입과, 앱이 계산해서 쓰는 값으로 나눈다. 필드 이름은 서버 JSON과 같다([contracts/trips-api.md](./contracts/trips-api.md)).

## 서버 타입 (`features/trip/types.ts`)

### Trip

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| id | string (uuid) | |
| title | string | 공백 제거 후 1~200자 |
| startDate | string \| null | `YYYY-MM-DD`. endDate와 함께 있거나 함께 없음 |
| endDate | string \| null | |
| destinationRegionIds | string[] | 고른 순서. 중복 없음 |
| status | `'PLANNING' \| 'ONGOING' \| 'COMPLETED'` | 서버가 응답 시각 기준으로 계산. 화면에는 쓰지 않고 `tripStatus`로 다시 계산한다(research R6) |
| currency | `'KRW'` | 이 명세에서 쓰지 않음 |
| ownerMemberId | string | 멤버 id(사용자 id 아님) |
| members | TripMember[] | 참여 중인 동행만, 참여 순 |
| version | number | 다음 명세(수정)에서 씀 |
| expenseVersion | number | 쓰지 않음 |

### TripMember

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| id | string | 멤버 id |
| user | UserCard | `nickname`, `profileImageUrl`(지금은 항상 null) |
| role | `'OWNER' \| 'MEMBER'` | |
| status | `'ACTIVE' \| 'LEFT' \| 'REMOVED'` | |
| joinOrder | number | |
| joinedAt | string | ISO UTC |
| leftAt | string \| null | |

### Region

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| id | string | |
| code | string | 법정동 코드 |
| name | string | 공식 이름 전체. "부산광역시 해운대구" |
| parentId | string \| null | |
| latitude, longitude | number \| null | 쓰지 않음 |

### Page<T>

`{ data: T[]; page: { nextCursor: string | null; hasNext: boolean } }`

### CreateTripBody

`{ title: string; startDate?: string; endDate?: string; destinationRegionIds?: string[] }`. 기간이 없으면 두 날짜를 모두 빼고 보낸다. 모르는 필드를 넣으면 400이다.

## 앱 입력 상태 (`useNewTripDraft`)

| 필드 | 타입 | 규칙 |
| --- | --- | --- |
| title | string | 보낼 때 앞뒤 공백 제거. 비면 "여행 이름을 입력해 주세요" |
| range | `{ start: string; end: string } \| null` | start ≤ end. 당일은 start = end |
| regions | Region[] | id 중복 없음. 이름 표시용으로 Region 전체를 둔다 |

[여행 만들기]에 성공하면 비운다. 실패·프로필 미완성이면 그대로 둔다.

## 계산 값 (`trip-rules.ts`, `lib/seoul-date.ts`)

### 서울 날짜

- `seoulToday(now = new Date())`: `now`에 9시간을 더한 UTC 날짜의 `YYYY-MM-DD`
- `daysBetween(from, to)`: 두 날짜 문자열의 일 수 차이
- `formatDay('2026-11-14')` → `11.14(토)`, `formatRange(start, end)` → `11.14(토) – 11.15(일)`. 당일이면 `11.14(토)` 하나

### 여행 상태 `tripStatus(trip, today)`

기간 없음 → PLANNING / `today < startDate` → PLANNING / `startDate ≤ today ≤ endDate` → ONGOING / 그 밖 → COMPLETED. `today`는 `useSeoulToday()`(앱이 다시 앞으로 오면 새로 구함).

### D-day와 n일차

- PLANNING이고 기간이 있으면 `dDay = daysBetween(today, startDate)` (1 이상). 기간이 없으면 없음
- ONGOING이면 `dayIndex = daysBetween(startDate, today) + 1`

### 목록 묶기 `groupTrips(trips, today)`

`trips`는 `hasNext`가 false가 될 때까지 받은 전체다(research R7). 아래 상태는 모두 `tripStatus(trip, today)` 값이다.

| 묶음 | 규칙 |
| --- | --- |
| featured | ONGOING 중 startDate가 가장 이른 것. 없으면 PLANNING이고 기간이 있는 것 중 startDate가 가장 이른 것. 없으면 null |
| next | featured를 뺀 PLANNING. startDate 오름차순, 기간 없는 것은 뒤(그 안에서는 서버 순서) |
| past | COMPLETED. endDate 내림차순 |

featured가 ONGOING이 아니면 표시는 "다가오는 여행", ONGOING이면 "여행 중"이다. 남은 ONGOING 여행(두 개 이상 겹친 경우)은 next 맨 앞에 둔다.

### 상세 보기 `tripDetailView(trip, today)`

| 경우 | 큰 제목 | 단계 | 지금 단계 버튼 |
| --- | --- | --- | --- |
| PLANNING, 여행지 없음 | 두근두근, 어디로 떠날까요? | ① 장소 모으기(지금) ② 지역 투표 ③ 코스 짜기 | [장소 모으기] → S20 |
| PLANNING, 여행지 있음 | 두근두근, {여행지} 여행 D-{n} (기간 없으면 D-day 빼고 "두근두근, {여행지} 여행") | ✓ 장소 모으기 ② 코스 짜기(지금) ③ 여행 떠나기 | [코스 짜기] → S23 |
| ONGOING | {여행지} 여행 {n}일차예요 | 오늘 코스 요약(코스 기능 전까지 "오늘 코스가 아직 없어요") | [오늘 코스] → S25 |
| COMPLETED | {여행지} 여행, 어땠나요? | ① 사진 올리기 ② 경비 정산하기 | [사진 올리기] → S30, [피드로 게시] → S38 |

{여행지}는 `destinationLabel`: 1곳 "부산", 2곳 "부산·강릉", 3곳 이상 "부산 외 2곳"(research R14). 여행지가 없는 ONGOING·COMPLETED는 "{여행지} 여행" 자리에 여행 이름만 쓴다("겨울 여행 1일차예요").

S15 진행 단계: 계획 중 · 여행 중 · 다녀옴 · 게시됨. 현재 상태를 강조하되 '게시됨'은 공동 피드 연결 전까지 강조하지 않는다.

동행 얼굴: `AvatarGroup max=4`, 나머지는 "+n". 동행 줄: 나를 뺀 동행 닉네임으로 "세은·승기와 함께"(3명 넘으면 "세은·승기 외 2명과 함께"), 혼자면 "동행을 초대해 보세요".

### 지역 짧은 이름 `shortRegionName(name)`

공백으로 나눈 마지막 단어. 한 단어면 끝의 "특별시·광역시·특별자치시·특별자치도·도"를 뗀다. 예: "부산광역시" → "부산", "서울특별시 종로구" → "종로구".
