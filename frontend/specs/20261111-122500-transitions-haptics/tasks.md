# Tasks: 탭·화면 전환과 진동

**Input**: Design documents from `specs/20261111-122500-transitions-haptics/`

경로는 `frontend/` 기준이다.

## Phase 1: Setup

- [x] T001 Jira EODI-297과 브랜치 `feature/EODI-297-transitions-haptics`를 만든다. 6번 주제 브랜치 위에 쌓는다
- [x] T002 탭·스택 전환 옵션과 진동 함수가 설치된 패키지에 있는지 타입에서 확인한다

## Phase 2: User Story 1 - 화면이 방향을 가지고 바뀐다 (P2)

- [x] T003 [US1] `src/app/(main)/(tabs)/_layout.tsx`에 탭 전환(겹쳐 바뀜, 150ms)을 넣는다 (FR-001)
- [x] T004 [US1] `src/app/(main)/_layout.tsx`의 스택 기본 전환을 옆에서 들어오게 하고 `trips/new`는 아래에서 올라오게 한다 (FR-002, FR-003)

## Phase 3: User Story 2 - 손끝으로 결과를 안다 (P2)

- [x] T005 [US2] `src/lib/haptics.ts`에 진동 다섯 가지를 만들고 `src/lib/haptics.test.ts`에 테스트를 쓴다 (FR-004, FR-010)
- [x] T006 [US2] 공통 부품에 붙인다: `src/components/ui/tab-bar.tsx`(가볍게), `button.tsx`(주요 버튼 가볍게), `chip.tsx`(선택), `check-mark.tsx`(방금 체크하면 선택), `confirm-sheet.tsx`(경고), `toast.tsx`(실패 안내에 실패) (FR-005, FR-006, FR-008, FR-009)
- [x] T007 [US2] 내 화면의 성공 지점에 붙인다: `src/features/trip/hooks/use-create-trip.ts`, `use-update-trip.ts`, `src/features/poll/hooks/use-open-poll.ts`, `src/features/proposal/hooks/use-proposal.ts` (FR-007)

## Phase 4: Polish

- [x] T008 전체 `npx jest`, `npx tsc --noEmit`, `npx expo lint`를 통과시키고, 웹 미리보기에서 앱이 뜨고 새 여행 화면이 열리는지 확인한다
- [ ] T009 사용자 몫: 휴대폰에서 탭 전환, 옆에서·아래에서 들어오는 화면, 진동 다섯 가지를 확인한다. 터치 진동이 켜져 있어야 한다

## Phase 5: Convergence

2026-11-11에 spec·plan·tasks와 코드를 대조했다. 빠진 것이 없어 더할 작업이 없다.

## 넘긴 것

- 코스 순서 끌기의 진동은 넣지 않았다. 지금은 끌기가 없다(Q-19-4).
- 다른 담당의 입력 화면(링크·캡처 등록 등)은 아래에서 올라오게 바꾸지 않았다(Q-19-1).
