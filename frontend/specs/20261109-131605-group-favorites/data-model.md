# Data Model: 그룹 즐겨찾기

- SavedPlace(백엔드 SavedPlaceView): `place: Place, savedBy: {memberId, memo|null}[], savedCount`
- SavedPlacePage: `items, totals {allPlaceCount, overlapPlaceCount, filteredCount}, page {nextCursor, hasNext}` — DataResponse로 감싸지 않음
- 필터: `filter: ALL|OVERLAP, memberId?: string`
- 화면 상태: `view: list|map`, `selecting: Set<placeId>|null`, `sheet: placeId|null`, `adding: boolean`, `memberFilter: memberId|null`
- 겹침: savedCount ≥ 2
