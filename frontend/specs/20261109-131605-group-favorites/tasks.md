# Tasks: 그룹 즐겨찾기

**Input**: `specs/20261109-131605-group-favorites/`
**Tests**: 규칙은 jest, 화면은 RNTL.

## Phase 1: Foundational

- [ ] T001 [P] 그룹 즐겨찾기 타입을 src/features/group-favorites/types.ts에 만든다
- [ ] T002 목록·담기·메모·빼기·코스 장소 API를 src/features/group-favorites/api.ts에 만든다
- [ ] T003 [P] 캐시 키를 src/features/group-favorites/hooks/group-keys.ts에 만든다
- [ ] T004 담은 사람 이름·겹침·내 저장 여부·필터 수 규칙과 테스트를 src/features/group-favorites/group-rules.ts, group-rules.test.ts에 만든다
- [ ] T005 [P] 테스트·미리보기 데이터를 src/features/group-favorites/testing.ts에 만든다
- [ ] T006 테스트 모드 가짜 그룹 즐겨찾기 서버를 src/api/dev-mock-group.ts에 만들고 src/api/dev-mock.ts에 연결한다
- [ ] T007 목록 무한 조회 훅과 코스 장소 훅을 src/features/group-favorites/hooks/use-group-favorites.ts, use-course-places.ts에 만든다

## Phase 2: User Story 1 - 모은 장소 보기 (P1)

- [ ] T008 [P] [US1] 필터 줄 FilterBar와 장소 줄 PlaceRow를 src/features/group-favorites/components/filter-bar.tsx, place-row.tsx에 만든다
- [ ] T009 [P] [US1] 지도 보기 FavoritesMap을 src/features/group-favorites/components/favorites-map.tsx에 만든다
- [ ] T010 [P] [US1] 동행 고르기 시트 MemberFilterSheet를 src/features/group-favorites/components/member-filter-sheet.tsx에 만든다
- [ ] T011 [US1] 아래 버튼 BottomActions와 S20 화면·라우트를 src/features/group-favorites/components/bottom-actions.tsx, screens/group-favorites-screen.tsx, src/app/(main)/trips/[tripId]/favorites.tsx에 만든다
- [ ] T012 [US1] 목록·겹친 곳·동행 필터·이어 받기·지도 RNTL 테스트를 screens/group-favorites-screen.test.tsx에 쓴다
- [ ] T013 [US1] 미리보기 src/app/dev/group-favorites.tsx에 list, overlap, map, load-error 상태를 만든다

## Phase 3: User Story 2 - 담기와 빼기 (P1)

- [ ] T014 [US2] 담기·메모·빼기 훅을 src/features/group-favorites/hooks/use-favorite-mutations.ts에 만든다
- [ ] T015 [P] [US2] 장소 추가 시트와 개인 즐겨찾기 고르기 시트를 components/add-place-sheet.tsx, bookmark-pick-sheet.tsx에 만든다
- [ ] T016 [P] [US2] 장소 시트와 코스에 있는 장소 빼기 확인을 components/place-sheet.tsx, in-course-confirm.tsx에 만든다
- [ ] T017 [US2] 화면에 추가·장소 시트·확인을 연결한다
- [ ] T018 [US2] 담기·두 번 누르기·메모·빼기·코스 확인 RNTL 테스트와 미리보기 add-sheet, place-sheet, in-course 상태를 더한다

## Phase 4: User Story 3 - 장소 없음 (P2)

- [ ] T019 [US3] 빈 상태 FavoritesEmpty를 만들어 화면에 연결하고 테스트와 미리보기 empty를 더한다

## Phase 5: User Story 4 - 후보 고르기와 추천 (P2)

- [ ] T020 [US4] 후보 고르기 모드와 추천 받기 안내를 화면에 연결하고 테스트와 미리보기 selecting을 더한다

## Phase 6: User Story 5 - 들어가기 (P3)

- [ ] T021 [US5] S17 '즐겨찾기' 메뉴를 연결하고 테스트를 src/features/group-favorites/favorites-entry.test.tsx에 둔다

## Phase 7: Polish

- [ ] T022 전체 테스트·타입·린트, 미리보기 Figma 비교
- [ ] T023 spec 상태와 quickstart 정리
- [ ] T024 사용자 몫: 로컬 백엔드 + 웹 확인
- [ ] T025 사용자 몫: 안드로이드 기기 확인(지도 핀, 시트)
