# Tasks: 그룹 즐겨찾기

**Input**: `specs/20261109-131605-group-favorites/`
**Tests**: 규칙은 jest, 화면은 RNTL.

## Phase 1: Foundational

- [X] T001 [P] 그룹 즐겨찾기 타입을 src/features/group-favorites/types.ts에 만든다
- [X] T002 목록·담기·메모·빼기·코스 장소 API를 src/features/group-favorites/api.ts에 만든다
- [X] T003 [P] 캐시 키를 src/features/group-favorites/hooks/group-keys.ts에 만든다
- [X] T004 담은 사람 이름·겹침·내 저장 여부·필터 수 규칙과 테스트를 src/features/group-favorites/group-rules.ts, group-rules.test.ts에 만든다
- [X] T005 [P] 테스트·미리보기 데이터를 src/features/group-favorites/testing.ts에 만든다
- [X] T006 테스트 모드 가짜 그룹 즐겨찾기 서버를 src/api/dev-mock-group.ts에 만들고 src/api/dev-mock.ts에 연결한다
- [X] T007 목록 무한 조회 훅과 코스 장소 훅을 src/features/group-favorites/hooks/use-group-favorites.ts, use-course-places.ts에 만든다

## Phase 2: User Story 1 - 모은 장소 보기 (P1)

- [X] T008 [P] [US1] 필터 줄 FilterBar와 장소 줄 PlaceRow를 src/features/group-favorites/components/filter-bar.tsx, place-row.tsx에 만든다
- [X] T009 [P] [US1] 지도 보기 FavoritesMap을 src/features/group-favorites/components/favorites-map.tsx에 만든다
- [X] T010 [P] [US1] 동행 고르기 시트 MemberFilterSheet를 src/features/group-favorites/components/member-filter-sheet.tsx에 만든다
- [X] T011 [US1] 아래 버튼 BottomActions와 S20 화면·라우트를 src/features/group-favorites/components/bottom-actions.tsx, screens/group-favorites-screen.tsx, src/app/(main)/trips/[tripId]/favorites.tsx에 만든다
- [X] T012 [US1] 목록·겹친 곳·동행 필터·이어 받기·지도 RNTL 테스트를 screens/group-favorites-screen.test.tsx에 쓴다
- [X] T013 [US1] 미리보기 src/app/dev/group-favorites.tsx에 list, overlap, map, load-error 상태를 만든다

## Phase 3: User Story 2 - 담기와 빼기 (P1)

- [X] T014 [US2] 담기·메모·빼기 훅을 src/features/group-favorites/hooks/use-favorite-mutations.ts에 만든다
- [X] T015 [P] [US2] 장소 추가 시트와 개인 즐겨찾기 고르기 시트를 components/add-place-sheet.tsx, bookmark-pick-sheet.tsx에 만든다
- [X] T016 [P] [US2] 장소 시트와 코스에 있는 장소 빼기 확인을 components/place-sheet.tsx, in-course-confirm.tsx에 만든다
- [X] T017 [US2] 화면에 추가·장소 시트·확인을 연결한다
- [X] T018 [US2] 담기·두 번 누르기·메모·빼기·코스 확인 RNTL 테스트와 미리보기 add-sheet, place-sheet, in-course 상태를 더한다

## Phase 4: User Story 3 - 장소 없음 (P2)

- [X] T019 [US3] 빈 상태 FavoritesEmpty를 만들어 화면에 연결하고 테스트와 미리보기 empty를 더한다

## Phase 5: User Story 4 - 후보 고르기와 추천 (P2)

- [X] T020 [US4] 후보 고르기 모드와 추천 받기 안내를 화면에 연결하고 테스트와 미리보기 selecting을 더한다

## Phase 6: User Story 5 - 들어가기 (P3)

- [X] T021 [US5] S17 '즐겨찾기' 메뉴를 연결하고 테스트를 src/features/group-favorites/favorites-entry.test.tsx에 둔다

## Phase 7: Polish

- [X] T022 전체 테스트·타입·린트, 미리보기 Figma 비교
- [X] T023 spec 상태와 quickstart 정리
- [ ] T024 사용자 몫: 로컬 백엔드 + 웹 확인
- [ ] T025 사용자 몫: 안드로이드 기기 확인(지도 핀, 시트)

## Phase 9: Convergence

- [X] T026 좌표가 없는 장소는 지도 핀을 그리지 않게 FavoritesMap을 고치고 테스트를 더한다 per Edge Cases 좌표 없음 (partial)

## Phase 10: Review 1

- [X] T027 후보 고르기 중 지도 보기의 장소 카드도 체크 상자와 고름 상태를 보이게 FavoritesMap에 selecting을 넘기고 테스트를 더한다
- [X] T028 메모 저장이 끝나면 "메모를 저장했어요" 안내를 띄우고, 두 번 눌러 보내지 않은 때는 다시 받지 않게 use-favorite-mutations를 고치고 테스트를 더한다

## Phase 11: Review 2

- [X] T029 개인 즐겨찾기 고르기 시트의 '담김'은 내가 이미 담은 장소에만 붙여, 동행만 담은 장소는 내가 더 담아 겹치게 할 수 있게 고치고 테스트를 더한다
- [X] T030 테스트 모드 가짜 서버에서 개인 즐겨찾기 장소가 그룹에 이미 있는 장소와 같으면 그 장소에 내 저장을 더하도록 src/api/dev-mock-group.ts를 고친다
