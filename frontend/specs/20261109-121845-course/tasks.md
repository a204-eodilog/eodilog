# Tasks: 코스 짜기·보기

**Input**: Design documents from `specs/20261109-121845-course/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 초안 규칙과 작업 기다림은 jest 단위 테스트, 화면은 RNTL 테스트를 같은 단계에 둔다.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 [P] 코스 오류 코드 INVALID_ROUTE_LEGS를 src/api/errors.ts에 더한다
- [X] T002 [P] 코스·구간·저장 본문·자동 추천·그룹 즐겨찾기 타입을 src/features/course/types.ts에 만든다

## Phase 2: Foundational

- [X] T003 getItinerary, replaceItinerary, requestAutoCourse, getAutoCourse, recalculateRoutes, getJob, getTripSavedPlaces, updateTripDates를 src/features/course/api.ts에 만든다
- [X] T004 [P] 캐시 키를 src/features/course/hooks/course-keys.ts에 만든다
- [X] T005 [P] 테스트·미리보기용 장소·코스·구간 만들기 함수를 src/features/course/testing.ts에 만든다
- [X] T006 초안 변환 toDraft, 저장 본문 toWrite, 고치기 moveItem·removeItem·replacePlace·addPlace·setLegMode, sameContent, dayCount, dayLabel, legLabel, editedLine, hasUnavailable, dayRegions를 src/features/course/course-rules.ts에 만든다
- [X] T007 T006 규칙 단위 테스트, 특히 어떤 고치기 뒤에도 구간이 인접 쌍마다 하나이고 order가 1부터 빈틈없음을 src/features/course/course-rules.test.ts에 쓴다
- [X] T008 테스트 모드 가짜 코스·자동 추천·다시 계산·그룹 즐겨찾기 서버와 조종 함수를 src/api/dev-mock-course.ts에 만들고 src/api/dev-mock.ts에 연결한다
- [X] T009 [P] 코스 조회 훅 useItinerary를 src/features/course/hooks/use-itinerary.ts에 만든다
- [X] T010 [P] 그룹 즐겨찾기 조회 훅 useTripSavedPlaces를 src/features/course/hooks/use-saved-places.ts에 만든다

## Phase 3: User Story 1 - 저장된 코스 보기 (P1)

- [X] T011 [P] [US1] 고른 날 번호 핀과 경로선을 그리는 CourseMap과 RoutePath를 src/features/course/components/course-map.tsx, route-path.tsx, route-path.web.tsx에 만든다
- [X] T012 [P] [US1] 일차 탭 DayTabs를 src/features/course/components/day-tabs.tsx에 만든다
- [X] T013 [P] [US1] 장소 줄과 구간 칩 CourseDayList를 보기·고치기 두 모드로 src/features/course/components/course-day-list.tsx에 만든다
- [X] T014 [P] [US1] 이동 시간 갱신 실패 카드 RouteFailCard를 src/features/course/components/route-fail-card.tsx에 만든다
- [X] T015 [US1] 다시 계산 훅 useRecalculate를 src/features/course/hooks/use-recalculate.ts에 만든다
- [X] T016 [US1] S24 CourseScreen을 src/features/course/screens/course-screen.tsx에 만들고 라우트 src/app/(main)/trips/[tripId]/course/index.tsx를 둔다
- [X] T017 [US1] S24 기본·일차 바꾸기·편집·갱신 실패·다시 계산·빈 코스 이동 RNTL 테스트를 src/features/course/screens/course-screen.test.tsx에 쓴다
- [X] T018 [US1] 미리보기 src/app/dev/course.tsx에 view, view-fail, load-error 상태를 만든다

## Phase 4: User Story 2 - 코스 초안 고치고 저장하기 (P1)

- [X] T019 [P] [US2] 이동 수단 칩 TransportChips를 src/features/course/components/transport-chips.tsx에 만든다
- [X] T020 [P] [US2] 장소 시트 ItemSheet를 src/features/course/components/item-sheet.tsx에 만든다
- [X] T021 [US2] 저장 훅 useSaveItinerary를 src/features/course/hooks/use-save-itinerary.ts에 만든다
- [X] T022 [US2] S23 CourseEditScreen 초안 모드와 라우트 src/app/(main)/trips/[tripId]/course/edit.tsx를 src/features/course/screens/course-edit-screen.tsx에 만든다
- [X] T023 [US2] 순서·바꾸기·빼기·수단·완료·충돌·두 번 누르기·나가기 확인 RNTL 테스트를 src/features/course/screens/course-edit-screen.test.tsx에 쓴다
- [X] T024 [US2] 미리보기에 draft, item-sheet 상태를 더한다 src/app/dev/course.tsx

## Phase 5: User Story 3 - 직접 만들기 (P1)

- [X] T025 [US3] 직접 만들기 ManualBuilder를 src/features/course/components/manual-builder.tsx에 만든다
- [X] T026 [US3] S23에 직접 만들기 모드를 연결한다 src/features/course/screens/course-edit-screen.tsx
- [X] T027 [US3] 직접 만들기 RNTL 테스트와 미리보기 manual, manual-placed 상태를 더한다

## Phase 6: User Story 4 - 구성 방식 고르기와 준비 상태 (P2)

- [X] T028 [P] [US4] 구성 방식 선택·여행지 미정·기간 없음 SetupViews를 src/features/course/components/setup-views.tsx에 만든다
- [X] T029 [P] [US4] 자동 추천 생성 중·실패 AutoViews를 src/features/course/components/auto-views.tsx에 만든다
- [X] T030 [US4] 자동 추천 훅 useAutoCourse를 src/features/course/hooks/use-auto-course.ts에 만든다
- [X] T031 [US4] useAutoCourse 성공·실패·시간 초과·화면 나가기 테스트를 src/features/course/hooks/use-auto-course.test.tsx에 쓴다
- [X] T032 [US4] S23에 준비 상태·자동 추천·재추천을 연결한다 src/features/course/screens/course-edit-screen.tsx
- [X] T033 [US4] 준비 상태·자동 추천 RNTL 테스트와 미리보기 choose, no-region, no-dates, auto-loading, auto-fail 상태를 더한다

## Phase 7: User Story 5 - 이동 시간 계산 불가 (P2)

- [X] T034 [US5] 초안의 계산 불가 구간 문구·지도 표시·다시 계산 안내를 연결하고 RNTL 테스트와 미리보기 no-route 상태를 더한다

## Phase 8: User Story 6 - 여러 지역 날짜별로 나누기 (P3)

- [X] T035 [US6] 날짜별 지역 줄 RegionSplit을 src/features/course/components/region-split.tsx에 만들고 S23과 직접 만들기, split 주소에 연결한다
- [X] T036 [US6] 날짜별 지역 RNTL 테스트와 미리보기 split 상태를 더한다

## Phase 9: User Story 7 - 코스 들어가기 (P3)

- [X] T037 [US7] S17 '코스' 메뉴를 코스 주소로 연결하고 테스트를 src/features/trip/components/trip-menu-grid.tsx, trip-menu-grid.test.tsx에 둔다

## Phase 10: Polish

- [X] T038 전체 테스트·타입 검사·린트 통과, /dev/course 모든 상태를 Figma와 비교해 고친다
- [X] T039 spec 상태와 quickstart를 실제와 맞춘다
- [ ] T040 사용자 몫: 로컬 백엔드 + 웹 확인
- [ ] T041 사용자 몫: 안드로이드 기기에서 지도 핀·선, 달력, 시트 확인

## Dependencies & Execution Order

Phase 1 → 2 → US1 → US2 → US3 → US4 → US5 → US6 → US7 → Polish. 화면 파일을 같이 고치는 작업은 차례로 한다.

## Implementation Strategy

US1·US2·US3만으로 코스를 만들고 보는 MVP. 나머지는 준비 상태와 보조 흐름.

## Phase 11: Convergence

- [X] T042 고친 내용이나 저장하지 않은 추천안이 있을 때 안드로이드 뒤로 버튼과 뒤로 쓸기로 나가도 버릴지 묻도록 src/features/course/screens/course-edit-screen.tsx에서 화면 떠나기를 막고 테스트를 더한다 per US2/AC10 (partial)

## Phase 12: Review 1

- [X] T043 저장된 코스의 구간 기준 시각이 아직 저장하지 않은 추천안이나 직접 만든 초안 안내에 붙지 않도록 src/features/course/screens/course-edit-screen.tsx를 고친다
- [X] T044 S24 빼기 알약과 S23 구간 칩의 누르는 영역을 44 이상으로 넓힌다 src/features/course/components/course-day-list.tsx

## Phase 13: Review 2

- [X] T045 초안의 재추천이 실패하면 직접 만들기 대신 고치던 코스로 돌아가기를 보여 고치던 초안을 잃지 않게 src/features/course/components/auto-views.tsx, screens/course-edit-screen.tsx를 고치고 테스트를 더한다

## Phase 14: Review 3

- [X] T046 지도 위 표시를 Figma처럼 흰 알약 그림자에 종류별 글자색과 아이콘으로 바꾼다. 추천안 파랑 전구, 경로 못 찾음 빨강 경고, 저장됨 연초록, 고치는 중 회색 연필과 자물쇠 src/features/course/components/course-map.tsx
