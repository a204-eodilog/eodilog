# Tasks: 바텀시트와 순서대로 나오는 글

**Input**: Design documents from `specs/20261111-120000-sheet-stagger/`

경로는 `frontend/` 기준이다.

## Phase 1: Setup

- [x] T001 Jira EODI-296과 브랜치 `feature/EODI-296-sheet-stagger`를 만든다. 5번 주제 브랜치 위에 쌓는다
- [x] T002 내 시트 가운데 열린 뒤에야 목록을 받는 곳을 코드로 찾는다: 투표 열기, 후보 추가, 내 즐겨찾기에서 담기

## Phase 2: User Story 1 - 시트가 올라오면 목록이 같이 보인다 (P1)

- [x] T003 [US1] `src/features/poll/components/open-poll-sheet.tsx`, `add-candidate-sheet.tsx`가 `prefetch`를 받게 하고 `src/features/poll/screens/poll-screen.tsx`가 여는 버튼이 보일 때 넘긴다 (FR-001)
- [x] T004 [US1] `src/features/group-favorites/screens/group-favorites-screen.tsx`가 장소 추가 시트가 뜨면 내 즐겨찾기를 받고, 장소를 고르는 동안 투표 열기 후보를 미리 받는다 (FR-001)
- [x] T005 [US1] `src/features/recommend/screens/recommend-screen.tsx`가 추천 결과가 보이면 투표 열기 후보를 미리 받는다 (FR-001)

## Phase 3: User Story 2 - 글이 순서대로 나온다 (P2)

- [x] T006 [US2] `src/theme/motion.ts`에 `stagger.gap` 60을 더하고 `src/components/ui/stagger.tsx`에 `Stagger`를 만든다. `src/components/ui/stagger.test.tsx`에 테스트 4개를 쓴다 (FR-003, FR-009)
- [x] T007 [US2] `src/components/ui/bottom-sheet.tsx`, `popup.tsx`, `empty-state.tsx`에 붙인다 (FR-004~FR-006)
- [x] T008 [US2] `src/features/trip/screens/new-trip-screen.tsx`의 큰 질문과 안내 줄에 붙인다 (FR-007)

## Phase 4: Polish

- [x] T009 전체 `npx jest`, `npx tsc --noEmit`, `npx expo lint`를 통과시킨다
- [ ] T010 사용자 몫: 휴대폰에서 세 시트를 열어 목록이 같이 보이는지, 순서대로 나오는 글의 빠르기가 괜찮은지 본다
- [ ] T011 사용자 몫: 목록이 든 시트를 화면 녹화해 여전히 늦게 뜨는 시트가 있는지 본다. 있으면 어느 시트인지 알려 준다

## Phase 5: Convergence

2026-11-11에 spec·plan·tasks와 코드를 대조했다.

- [x] T012 그려지는 체크와 움직이는 Pressable이 웹 개발 화면에 내던 경고를 줄인다 per plan R3 (partial)

## 넘긴 것

- 웹 미리보기에서 시트를 열어 눈으로 확인하지 못했다. 미리보기 창이 가려져 있어 화면 갱신이 멈췄다. 자동 테스트와 타입 검사로만 확인했다.
- 시트 높이를 재느라 늦는 경우와 다른 담당 시트는 다루지 않았다.
