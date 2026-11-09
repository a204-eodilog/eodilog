# Data Model: 코스 짜기·보기

## Itinerary (서버)
`tripId, version, items: ItineraryItem[], legs: RouteLeg[], updatedByMemberId, updatedAt`

## ItineraryItem
`id, place: Place, day(1~), order(1~), startTime: "HH:mm"|null, stayMinutes|null`

## RouteLeg
`fromItemId, toItemId, transportMode: WALK|CAR|TRANSIT, durationSeconds|null, distanceMeters|null, geometry: {type:'LineString', coordinates:[lng,lat][]}|null, status: AVAILABLE|UNAVAILABLE, queriedAt`

## ItineraryWrite (저장 본문)
`expectedVersion, items: {id?, placeId, day, order, startTime?, stayMinutes?}[], legs: {day, fromOrder, toOrder(=fromOrder+1), transportMode}[]` — 항목 ≤ 200

## CourseDraft (화면)
- `baseVersion`
- `days: DraftItem[][]` — 인덱스 0이 1일차
- `DraftItem: { key, id: string|null, place, startTime, stayMinutes }`
- `modes: Record<"fromKey>toKey", TransportMode>`
- `legInfo: Record<"fromKey>toKey", RouteLeg>` 서버 구간 결과(저장된 쌍만)

## ItineraryProposal (API 명세)
`job: Job, baseVersion, reason, proposed: {items, legs}|null, diff, appliedAt, canUndo`

## 상태 전이 (S23)
`setup(choose|noRegion|noDates)` → `auto(loading)` → `draft` | `auto(fail)` → `manual` → `draft` → [완료] → S24
