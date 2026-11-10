# Research: 그룹 즐겨찾기

## R1. 목록 받기
- **Decision**: useInfiniteQuery로 GET saved-places를 limit 20씩, page.nextCursor로 이어 받는다. 키는 ['trips', tripId, 'saved-places', 'list', {filter, memberId}]로 개인 즐겨찾기 화면(B)이 무효화하는 ['trips', tripId, 'saved-places'] 아래에 둔다.
- **Rationale**: B의 그룹 담기 뒤 무효화가 이 목록에도 닿는다(FR-010). 응답은 감싸지 않은 SavedPlacePage.

## R2. 담기·메모·빼기
- **Decision**: PUT .../me(담기, 메모 없이), PATCH .../me {memo}(2000자), DELETE .../me. 성공하면 ['trips', tripId, 'saved-places'] 전체를 무효화. 담기는 장소 ID마다 보내는 중이면 다시 보내지 않는다. 개인 즐겨찾기에서 여러 곳 담기는 차례로 보낸다.
- **Rationale**: PUT은 멱등이라 다시 보내도 하나지만 버튼 연타로 요청이 쌓이지 않게 막는다.

## R3. 코스에 있는 장소
- **Decision**: GET /trips/{tripId}/itinerary로 코스 항목의 장소 ID와 updatedByMemberId를 읽는다(이 화면에 필요한 값만). 빼려는 장소가 코스에 있으면 확인을 띄운다.

## R4. 지도
- **Decision**: 공통 MapView·MapMarker. 핀은 담은 사람 첫 글자 묶음(initials)과 겹친 수(countTone badge). 핀을 누르면 아래 카드. bbox는 쓰지 않고 받은 목록 전부를 그린다(여행당 장소 수가 적다).

## R5. 투표·추천 연결
- **Decision**: 후보 고르기 모드는 이 화면 상태로 두고 마지막 이동만 준비 중 안내(Q-7-2). 추천은 9번 주제(Q-7-3).
