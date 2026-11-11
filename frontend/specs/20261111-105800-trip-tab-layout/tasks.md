# Tasks: 여행 탭 배치 바꾸기

**Input**: Design documents from `specs/20261111-105800-trip-tab-layout/`

경로는 `frontend/` 기준이다.

## Phase 1: Setup

- [x] T001 Jira EODI-291과 브랜치 `feature/EODI-291-trip-tab-layout`을 만든다. 2번 주제 브랜치 위에 쌓는다

## Phase 2: Foundational

- [x] T002 [P] `src/features/trip/trip-list-rules.test.ts`에 둘째 줄 글과 보이는 수 테스트를 쓴다
- [x] T003 `src/features/trip/trip-list-rules.ts`에 `tripListLead`, `visibleNextTrips`, `NEXT_VISIBLE_LIMIT`을 만든다 (FR-002)
- [x] T004 [P] `src/components/ui/icon.tsx`에 `chevron-down`, `chevron-up`을 더한다

## Phase 3: User Story 1 - 다음 계획을 한눈에 본다 (P1)

- [x] T005 [US1] `src/features/trip/components/past-trip-row.tsx`를 `trip-row.tsx`의 `TripRow`로 바꾸고 `kind`를 받게 한다 (FR-001)
- [x] T006 [US1] `src/features/trip/screens/trip-list-screen.tsx`의 다음 계획을 `TripRow` 세로 목록으로 바꾸고 더 보기·접기를 넣는다 (FR-002, FR-003)

## Phase 4: User Story 2 - 다녀온 여행은 옆으로 넘겨 본다 (P2)

- [x] T007 [US2] `src/features/trip/components/next-trip-card.tsx`를 `trip-card.tsx`의 `TripCard`로 바꾸고 `kind`를 받게 한다 (FR-004, FR-005)
- [x] T008 [US2] `src/features/trip/screens/trip-list-screen.tsx`의 다녀온 여행을 `TripCard` 가로 줄로 바꾼다 (FR-004)

## Phase 5: Polish

- [x] T009 `docs/design/design-decisions.md`의 S15 여행 목록 줄을 고치고, 전체 `npx jest`, `npx tsc --noEmit`, `npx expo lint`를 통과시키고, 웹 미리보기에서 3개와 더 보기·접기, 다녀온 여행 카드를 확인한다 (FR-007)
- [ ] T010 사용자 몫: 휴대폰에서 여행 탭을 확인한다. 다녀온 여행을 옆으로 넘길 때 화면이 위아래로 흔들리지 않는지 본다

## Phase 6: Convergence

2026-11-11에 spec·plan·tasks와 코드를 대조했다. 빠진 것이 없어 더할 작업이 없다.
