# Tasks: 움직임 공통 기준과 부품

**Input**: Design documents from `specs/20261111-111500-motion-base/`

경로는 `frontend/` 기준이다.

## Phase 1: Setup

- [x] T001 Jira EODI-292와 브랜치 `feature/EODI-292-motion-base`를 만든다. 3번 주제 브랜치 위에 쌓는다

## Phase 2: Foundational

- [x] T002 [P] `src/theme/motion.ts`에 기준값을 만들고 `src/theme/index.ts`에서 내보낸다 (FR-001)
- [x] T003 [P] `src/hooks/use-reduce-motion.ts`에 동작 줄이기 값을 앱 전체가 같이 보게 만든다 (FR-002)
- [x] T004 `src/components/ui/use-press-scale.ts`와 `src/components/ui/pressable-scale.tsx`를 만든다 (FR-003)

## Phase 3: User Story 1 - 누르면 눌린 느낌이 난다 (P1)

- [x] T005 [US1] `src/components/ui/button.tsx`에 눌림 크기와 글자·돌아가는 표시 바뀜을 넣는다 (FR-003, FR-004)
- [x] T006 [P] [US1] `src/components/ui/chip.tsx`, `src/components/ui/card.tsx`가 `PressableScale`을 쓰게 한다 (FR-003)

## Phase 4: User Story 2 - 체크하면 선이 그려진다 (P1)

- [x] T007 [US2] `src/components/ui/check-mark.tsx`에 `CheckMark`와 `CheckMarkWhen`을 만들고 `src/components/ui/round-check.tsx`에 붙인다 (FR-005)
- [x] T008 [US2] 내 화면의 체크 자리 7곳을 `CheckMarkWhen`으로 바꾼다: `src/features/poll/components/option-row.tsx`, `candidate-row.tsx`, `add-candidate-sheet.tsx`, `src/features/checklist/components/checklist-row.tsx`, `src/features/group-favorites/components/place-row.tsx`, `bookmark-pick-sheet.tsx`, `src/features/on-trip/components/alternative-list.tsx` (FR-006)

## Phase 5: User Story 3 - 창이 커지면서 나온다 (P2)

- [x] T009 [US3] `src/components/ui/popup.tsx`에 `Popup`을 만든다 (FR-007)
- [x] T010 [US3] 팝업 3곳을 `Popup`으로 옮긴다: `src/features/course/components/coedit-conflict.tsx`, `src/features/group-favorites/components/in-course-confirm.tsx`, `src/features/notification/components/notification-popup.tsx` (FR-008)

## Phase 6: User Story 4 - 탭을 고르면 아이콘이 반응한다 (P3)

- [x] T011 [US4] `src/components/ui/tab-bar.tsx`의 고른 탭 아이콘에 튀는 움직임을 넣는다 (FR-009)

## Phase 7: Polish

- [x] T012 `src/components/ui/motion.test.tsx`에 기준값·눌림·버튼·체크·팝업 테스트를 쓴다
- [x] T013 전체 `npx jest`, `npx tsc --noEmit`, `npx expo lint`를 통과시키고, 웹 미리보기에서 준비물 체크와 새 알림 창을 확인한다
- [ ] T014 사용자 몫: 휴대폰에서 버튼 튕김, 체크 그려지는 속도, 창이 커지는 빠르기, 탭 아이콘을 본다. 설정의 "애니메이션 삭제"를 켜고 움직임이 꺼지는지 본다

## Phase 8: Convergence

2026-11-11에 spec·plan·tasks와 코드를 대조했다.

- [x] T015 처음부터 체크돼 있던 것은 그리지 않게 `CheckMarkWhen`을 더한다. 처음 구현은 화면을 열 때 체크된 줄이 한꺼번에 그려졌다 per FR-005 (partial)
- [x] T016 새 알림 창의 카드 밖 누르기를 `Popup`의 `onBackdropPress`로 옮긴다 per FR-008 (partial)

## 넘긴 것

- 로그인 만료 창은 다른 담당 화면이라 옮기지 않았다(Q-16-1).
- 추천 결과의 "담김" 표시는 바꾸지 않았다(Q-16-4).
