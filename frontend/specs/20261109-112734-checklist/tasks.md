# Tasks: 준비물 체크리스트

**Input**: Design documents from `specs/20261109-112734-checklist/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 순수 규칙·큐·제안 더하기는 jest 단위 테스트, 화면은 RNTL 테스트를 같은 단계에 둔다.

**Organization**: 공통 기반 → US1 보고 체크 → US2 추가·고치기·지우기 → US3 빈 상태 → US4 다시 제안 → US5 진입 → Polish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일이고 앞 작업에 기대지 않아 함께 할 수 있다
- 경로는 `frontend/` 기준

## Phase 1: Setup (공통 파일 보강)

- [X] T001 [P] 준비물 오류 코드 CHECKLIST_ITEM_NOT_FOUND, AI_FEATURE_DISABLED, SUGGESTION_ALREADY_ADOPTED를 src/api/errors.ts API_ERROR에 더한다
- [X] T002 [P] 이·가 조사 함수 withIGa와 테스트를 src/lib/korean.ts, src/lib/korean.test.ts에 더한다
- [X] T003 [P] 더보기 점 세 개 아이콘 'more'를 src/components/ui/icon.tsx에 더한다

## Phase 2: Foundational (모든 이야기의 기반)

- [X] T004 [P] ChecklistItem, ChecklistSource, ChecklistSuggestion, Job, JobRef 타입을 src/features/checklist/types.ts에 만든다(data-model.md)
- [X] T005 getChecklist, addChecklistItem, adoptSuggestion, updateChecklistItem, deleteChecklistItem, requestSuggestions, getJob을 src/features/checklist/api.ts에 만든다(contracts/checklist-api.md)
- [X] T006 [P] 캐시 키 checklistKey를 src/features/checklist/hooks/checklist-keys.ts에 만든다
- [X] T007 progressLabel, progressRatio, checkerName, checkerLine, sourceTag, normalizeLabel, validateLabel, LABEL_MAX를 src/features/checklist/checklist-rules.ts에 만든다
- [X] T008 T007 규칙의 단위 테스트를 src/features/checklist/checklist-rules.test.ts에 쓴다
- [X] T009 [P] 테스트용 항목·작업 만들기 함수를 src/features/checklist/testing.ts에 만든다
- [X] T010 테스트 모드 가짜 준비물·제안·작업 서버와 조종 함수 editByOther, deleteByOther, failNextSuggestion, disableAi, reset을 src/api/dev-mock-checklist.ts에 만든다
- [X] T011 가짜 준비물 서버를 src/api/dev-mock.ts의 handle과 devMockControls에 연결한다

## Phase 3: User Story 1 - 함께 쓰는 목록 보고 체크하기 (P1) 🎯 MVP

**Goal**: S27 기본 상태를 보고 체크·해제한다. 연타는 마지막 상태로, 충돌은 최신 목록으로.
**Independent Test**: /dev/checklist?state=default에서 진행 숫자·막대·챙긴 사람을 보고, 체크하면 숫자가 바뀐다.

- [X] T012 [US1] 항목별로 요청 하나만 보내고 마지막 원하는 상태만 이어 보내는 createCheckQueue를 src/features/checklist/check-queue.ts에 만든다
- [X] T013 [US1] 5번 연타에 요청 3번 이하, 같은 상태면 안 보냄, 실패 콜백을 src/features/checklist/check-queue.test.ts로 증명한다
- [X] T014 [P] [US1] 목록 조회 훅 useChecklist를 src/features/checklist/hooks/use-checklist.ts에 만든다
- [X] T015 [US1] 낙관적 체크와 409·404·네트워크 오류 처리를 하는 useToggleCheck를 src/features/checklist/hooks/use-toggle-check.ts에 만든다
- [X] T016 [P] [US1] 진행 문구와 막대 ChecklistProgress를 src/features/checklist/components/checklist-progress.tsx에 만든다(Figma 201-15334)
- [X] T017 [P] [US1] 체크 상자·이름·이유·챙긴 사람·출처 표시·더보기 줄 ChecklistRow를 src/features/checklist/components/checklist-row.tsx에 만든다(Figma 201-15343)
- [X] T018 [US1] 머리·진행·목록·불러오기 실패·여행 없음을 그리는 ChecklistScreen을 src/features/checklist/screens/checklist-screen.tsx에 만든다
- [X] T019 [US1] 라우트 src/app/(main)/trips/[tripId]/checklist.tsx를 만든다
- [X] T020 [US1] 기본 상태·체크 반영·충돌 안내 RNTL 테스트를 src/features/checklist/screens/checklist-screen.test.tsx에 쓴다
- [X] T021 [US1] 미리보기 src/app/dev/checklist.tsx에 default, load-error 상태를 만든다

## Phase 4: User Story 2 - 직접 추가·고치기·지우기 (P1)

**Goal**: '챙길 것 추가'와 고치기 시트.
**Independent Test**: /dev/checklist?state=edit-sheet에서 시트가 보이고, 화면 테스트에서 추가·고치기·지우기가 목록에 반영된다.

- [X] T022 [US2] 추가 두 번 막기, 이름 고치기, 지우기와 409·404 처리를 하는 useItemMutations를 src/features/checklist/hooks/use-item-mutations.ts에 만든다
- [X] T023 [P] [US2] 입력과 추가 버튼 AddItemBar를 src/features/checklist/components/add-item-bar.tsx에 만든다(Figma 201-15456)
- [X] T024 [P] [US2] 준비물 고치기 시트 EditItemSheet를 src/features/checklist/components/edit-item-sheet.tsx에 만든다
- [X] T025 [US2] 추가 줄과 고치기 시트를 src/features/checklist/screens/checklist-screen.tsx에 연결한다
- [X] T026 [US2] 추가·두 번 누르기·고치기·지우기 RNTL 테스트를 src/features/checklist/screens/checklist-screen.test.tsx에 더한다
- [X] T027 [US2] 미리보기 src/app/dev/checklist.tsx에 edit-sheet 상태를 더한다

## Phase 5: User Story 3 - 비어 있을 때 시작하기 (P2)

**Goal**: S27 항목 없음과 [직접 추가] 입력.
**Independent Test**: /dev/checklist?state=empty와 empty-adding.

- [X] T028 [P] [US3] 빈 상태 ChecklistEmpty를 src/features/checklist/components/checklist-empty.tsx에 만든다(Figma 201-15518)
- [X] T029 [US3] 빈 상태와 [직접 추가] 입력 나타내기를 src/features/checklist/screens/checklist-screen.tsx에 연결한다
- [X] T030 [US3] 빈 상태 RNTL 테스트와 미리보기 empty, empty-adding 상태를 src/features/checklist/screens/checklist-screen.test.tsx, src/app/dev/checklist.tsx에 더한다

## Phase 6: User Story 4 - 다시 제안 받기 (P2)

**Goal**: 제안 작업 → 기다림 → 없는 이름만 채택, 실패·꺼짐 카드.
**Independent Test**: 단위 테스트로 지운·고친 항목 유지와 이미 채택 건너뛰기를 증명하고, /dev/checklist?state=suggest-fail·disabled·suggesting을 본다.

- [X] T031 [US4] 제안 중 더할 것을 고르는 pickSuggestions와 차례로 채택하는 adoptSuggestions를 src/features/checklist/suggestion-merge.ts에 만든다
- [X] T032 [US4] 이름 중복 제거, 기존 항목 불변, 이미 채택·400 건너뛰기, 꺼짐 멈춤을 src/features/checklist/suggestion-merge.test.ts로 증명한다
- [X] T033 [US4] 요청 키 유지, REQUEST_IN_PROGRESS면 같은 키로 한 번 더, 1.5초 간격 기다림, 2분 초과, 화면 나가면 멈춤을 하는 useSuggestChecklist를 src/features/checklist/hooks/use-suggest-checklist.ts에 만든다
- [X] T034 [US4] 성공·실패·취소·꺼짐·시간 초과를 src/features/checklist/hooks/use-suggest-checklist.test.tsx로 증명한다
- [X] T035 [P] [US4] 실패 카드 SuggestFailCard를 src/features/checklist/components/suggest-fail-card.tsx에 만든다(Figma 201-30087)
- [X] T036 [US4] 아래 [다시 제안 받기], 빈 상태 [제안 받기], 실패 카드, 안내 줄을 src/features/checklist/screens/checklist-screen.tsx에 연결한다
- [X] T037 [US4] 제안 받는 중·실패·다시 시도·꺼짐 RNTL 테스트를 src/features/checklist/screens/checklist-screen.test.tsx에 더한다
- [X] T038 [US4] 미리보기 src/app/dev/checklist.tsx에 suggesting, suggest-fail, disabled 상태를 더한다

## Phase 7: User Story 5 - 화면 들어가기 (P3)

- [X] T039 [US5] S17 메뉴 '여행 중'이 준비물 화면을 열도록 src/features/trip/components/trip-menu-grid.tsx에 연결한다
- [X] T040 [US5] '여행 중' 메뉴가 준비물 주소로 가는지 src/features/trip/components/trip-menu-grid.test.tsx로 확인한다

## Phase 8: Polish

- [X] T041 전체 테스트·타입 검사·린트를 통과시키고 /dev/checklist 모든 상태를 Figma와 비교해 어긋난 곳을 고친다
- [X] T042 spec.md 상태를 구현 완료로 바꾸고 quickstart.md를 실제 조종 함수 이름과 맞춘다
- [ ] T043 사용자 몫: 로컬 백엔드 + 웹에서 quickstart 흐름 확인
- [ ] T044 사용자 몫: 안드로이드 기기에서 체크 연타·제안 받기 확인

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1 → US2 → US3 → US4 → US5 → Polish
- US2·US3·US4는 US1의 화면 파일을 함께 고치므로 차례로 한다
- [P] 표시는 같은 단계 안에서 파일이 겹치지 않는다

## Parallel Example: User Story 1

```text
T014 use-checklist.ts, T016 checklist-progress.tsx, T017 checklist-row.tsx
```

## Implementation Strategy

US1만으로도 목록 보기·체크가 되는 MVP다. 그 위에 추가·빈 상태·제안을 더한다. T043·T044는 사용자가 확인하므로 체크하지 않는다.

## Phase 9: Convergence

- [X] T045 지우기에서 404 CHECKLIST_ITEM_NOT_FOUND면 이미 지워진 준비물이에요 안내를 띄우도록 src/features/checklist/hooks/use-item-mutations.ts를 고치고 화면 테스트를 더한다 per spec Edge Cases 고치기 시트를 연 사이 지워짐 (partial)
- [X] T046 제안 요청 응답을 놓쳐 다시 누르면 같은 Idempotency-Key를 다시 쓰도록, 작업 ID를 받기 전까지 키를 기억하게 src/features/checklist/hooks/use-suggest-checklist.ts를 고치고 테스트를 더한다 per US4/AC5, FR-011 (partial)

## Phase 10: Review 1

- [X] T047 키보드가 올라와도 챙길 것 추가 입력과 아래 다시 제안 받기 줄이 가려지지 않도록 src/features/checklist/screens/checklist-screen.tsx 본문을 KeyboardAvoidingView로 감싼다
- [X] T048 화면 읽기 기능이 준비물 줄에서 이름만이 아니라 출처 표시, 이유, 챙긴 사람도 읽도록 src/features/checklist/components/checklist-row.tsx 체크 상자에 설명을 단다

## Phase 11: Review 2

- [X] T049 항목 없음에서 다시 제안 실패 카드가 화면 가운데 묶음에 끼어 떠 보이지 않도록 카드를 위쪽에 고정하고 빈 상태 안내만 남은 공간 가운데에 두게 src/features/checklist/screens/checklist-screen.tsx를 고친다

## Phase 12: Review 3

- [X] T050 항목 없음의 제안 받기도 받는 동안 돌아가는 표시만이 아니라 제안 받는 중… 글자를 보이도록 src/features/checklist/components/checklist-empty.tsx를 고치고 화면 테스트를 더한다 per US4/AC1
