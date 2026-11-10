# Research: 지역·장소 투표

## R1 투표 응답과 후보 이름

- Decision: 투표 응답(`PollResponse`)의 후보는 `regionId`·`placeId`만 쓴다. 이름은 지역 `GET /regions/{id}`(기존 `['regions', id]` 캐시), 장소 `GET /places/{id}`(새 `['places', id]` 캐시)로 받는다.
- Rationale: 백엔드 `PollCandidateResponse`에 이름이 없다(`poll/dto/PollCandidateResponse.java`). 지역·장소 이름은 바뀌지 않아 `staleTime: Infinity`로 한 번만 받는다.
- Alternatives: 백엔드에 이름 필드 추가 요청 → 지금 응답으로 충분하고 후보가 30개까지라 요청 수도 작다.

## R2 표 저장 합치기

- Decision: `ballot-queue.ts`에 "보내는 중 요청 하나 + 다음에 보낼 선택 하나"만 둔다. 누를 때마다 다음 선택을 덮어쓰고, 앞 요청이 끝나면 다음 선택이 서버 선택과 다를 때만 보낸다.
- Rationale: `PUT ballot`은 내 선택 전체 교체라 마지막 선택만 보내면 된다. 요청을 동시에 여러 개 보내면 응답 순서가 뒤집혀 오래된 선택이 남을 수 있다.
- Alternatives: 누를 때마다 debounce → 기다리는 시간만큼 저장이 늦고, 앱을 바로 나가면 저장이 빠질 수 있다.

## R3 버전 충돌과 마감

- Decision: `expectedVersion`은 화면에 보이는 투표의 `version`을 쓴다. 409 `VERSION_CONFLICT`면 투표를 다시 받고 화면 선택(내가 고르려던 것)은 유지, 실패 안내와 [다시 시도]. 409 `POLL_CLOSED`면 다시 받아 결과 화면.
- Rationale: 백엔드 설명대로 version은 후보 추가와 마감 때만 오른다. 다른 동행의 투표로는 409가 나지 않는다(`PollController.replaceBallot`).
- 후보 추가는 여러 개를 차례로 넣는다. 409 `VERSION_CONFLICT`면 다시 받아 최신 version으로 한 번만 재시도한다.

## R4 마감 시각 고르기

- Decision: `@react-native-community/datetimepicker`(이미 설치, 9.2.1)로 날짜 → 시각 순서로 고른다. 웹에서는 이 부품이 없어 "기기에서 바꿀 수 있어요" 안내를 띄운다.
- Rationale: 새 패키지 없이 기기 기본 선택기를 쓴다. 고른 값은 `poll-rules.validateClosesAt`로 지금 이후·30일 이내를 검사한다.
- Alternatives: 직접 만든 시각 선택 시트 → 디자인이 없고 일이 크다.

## R5 그룹 즐겨찾기 목록

- Decision: `GET /trips/{tripId}/saved-places?filter=ALL&limit=100`를 끝까지 받아 후보 출처로 쓴다. 응답은 `DataResponse`로 감싸지 않은 `SavedPlacePage {items, totals, page}`다(백엔드 `TripSavedPlaceController.list`). 키는 B의 무효화 범위 `['trips', tripId, 'saved-places']` 아래 `'poll-source'`.
- Rationale: B의 장소 저장 시트가 저장 후 `['trips', tripId, 'saved-places']`를 무효화하므로 같은 앞부분을 쓰면 따로 맞출 일이 없다.
- 지역 후보는 장소의 `place.regionId`로 묶고, 지역마다 장소 수를 "그룹 즐겨찾기 N곳"으로 보인다.

## R6 지역 확정 뒤 여행 캐시

- Decision: 지역 투표가 `FINALIZED`인 것을 처음 받으면 `tripKey(tripId)`와 여행 목록을 무효화한다. 투표마다 한 번만(메모리 Set).
- Rationale: 서버가 확정 지역을 여행지 끝에 더하고 여행 version을 올린다(api-spec §7). S17·S15가 오래된 여행지를 보이면 안 된다.

## R7 대표 투표 고르기

- Decision: S17 메뉴로 들어오면 목록 첫 페이지에서 진행 중인 투표 중 가장 최근 것, 없으면 가장 최근 투표를 보인다. 투표가 없으면 빈 상태.
- Rationale: 투표 목록 화면 디자인이 없다(screen-list "S22 투표 목록" 미설계). 목록은 최근 생성 순이다(`PollController.getPolls`).

## R8 새 후보 판정

- Decision: 가장 이른 `addedAt`보다 1분 넘게 늦은 후보를 '새 후보'로 본다 (가정 — 사용자 확인 필요, Q-4-2).
- Rationale: 응답에 투표 생성 시각과 추가한 사람이 없다. 열기 요청 하나로 들어간 후보는 같은 시각이라 1분 여유면 충분하다.
