# Contract: 그룹 즐겨찾기 API (백엔드 TripSavedPlaceController)

| 동작 | 요청 | 성공 | 오류 |
|---|---|---|---|
| 목록 | GET /trips/{tripId}/saved-places?filter=ALL\|OVERLAP&memberId&cursor&limit(1~100, 기본 20) | 200 SavedPlacePage(감싸지 않음), 최근 담은 순 | 400 VALIDATION_ERROR, 404 TRIP_NOT_FOUND |
| 담기 | PUT .../saved-places/{placeId}/me `{memo?}` | 200 DataResponse<SavedPlaceView> | 404 NOT_FOUND(장소) |
| 메모 | PATCH .../saved-places/{placeId}/me `{memo}` 2000자 | 200 DataResponse<SavedPlaceView> | 404 NOT_FOUND(내 저장 없음) |
| 빼기 | DELETE .../saved-places/{placeId}/me | 204 | - |
| 코스 장소 | GET /trips/{tripId}/itinerary | items[].place.id, updatedByMemberId | 404 |
| 개인 즐겨찾기 | GET /me/bookmarks(B의 getAllBookmarks) | Bookmark[] | - |
