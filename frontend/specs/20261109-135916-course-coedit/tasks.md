# Tasks: 코스 함께 편집

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md), [contracts/routes.md](./contracts/routes.md)

**Tests**: 순수 규칙은 jest, 화면은 RNTL. 단계마다 `npx jest src/features/course`, `npx tsc --noEmit`, `npx eslint` 통과 뒤 체크한다.

## Phase 1: Foundational

- [X] T001 [P] 고친 날 찾기와 합치기 규칙 changedDays, rebaseDraft를 src/features/course/coedit-rules.ts에 만들고 src/features/course/coedit-rules.test.ts로 증명한다. 다른 날 합치기, 같은 날 겹침, 덮기에서 내 날이 이김, 옮겨진 항목이 두 번 들어가지 않음, 지워진 항목은 새 항목으로, 일수가 다를 때
- [X] T002 [P] 공유 연결이 끊겼다 다시 연결되는 순간만 알리는 useReconnected를 src/features/course/hooks/use-reconnected.ts에 만들고 테스트를 같은 폴더에 둔다. 처음 연결은 알리지 않는다
- [X] T003 [P] 테스트 모드 editByOther에 일차를 고를 수 있게 하고 다른 날 구간을 지우지 않게 src/api/dev-mock-course.ts를 고친다
- [X] T004 409 결과에서 안내를 빼 화면이 정하게 하고, 최신 코스를 받지 못하면 "최신 코스를 받지 못했어요. 다시 시도해 주세요"를 띄우도록 src/features/course/hooks/use-save-itinerary.ts를 고친다

## Phase 2: User Story 1 - 먼저 저장한 동행이 있을 때 내 변경 지키기 (P1)

- [X] T005 [P] [US1] Figma 201-13453 확인 상자 CoeditConflict를 src/features/course/components/coedit-conflict.tsx에 만든다
- [X] T006 [US1] src/features/course/screens/course-edit-screen.tsx에서 처음 코스를 기억하고, 저장 409 뒤 합친 초안과 안내 또는 확인 상자를 띄우며, [최신 코스 보기]와 [내 것으로 덮기]를 연결한다. src/features/course/screens/course-edit-screen.test.tsx의 충돌 테스트를 새 동작으로 바꾸고 다른 날 합치기, 같은 날 확인, 덮기, 최신 보기 테스트를 더한다
- [X] T007 [US1] 미리보기 src/app/dev/course-coedit.tsx에 conflict, merged 상태를 만든다

## Phase 3: User Story 2 - 함께 편집 중 연결이 끊겼다 돌아옴 (P1)

- [X] T008 [US2] 편집 화면에서 useReconnected로 최신 코스를 다시 받아 같은 규칙을 적용하고, 고친 것이 없으면 조용히 맞춘다. 화면 테스트를 더한다

## Phase 4: User Story 3 - 지금 편집 중인 동행 표시 (P3)

- [X] T009 [US3] 편집 중 동행 줄 CoeditorStrip을 src/features/course/components/coeditor-strip.tsx에 만들고 테스트와 미리보기 editors, editors-many 상태를 더한다

## Phase 5: Polish

- [X] T010 전체 테스트·타입·린트, 미리보기 Figma 비교, 테스트 모드 흐름 확인
- [X] T011 spec 상태와 quickstart 정리
- [ ] T012 사용자 몫: 로컬 백엔드 + 웹에서 두 계정으로 충돌 확인
- [ ] T013 사용자 몫: 안드로이드 기기에서 비행기 모드로 끊었다 돌아오기 확인, 장소 시트를 닫은 직후 [완료]가 한 번에 눌리는지

## Dependencies

- T001, T002, T003은 서로 다른 파일이라 함께 할 수 있다. T004는 T001 뒤.
- T006은 T001, T004, T005 뒤. T008은 T002, T006 뒤. T009는 따로.

## Phase 6: Convergence

- [X] T014 테스트 모드 코스 응답이 가짜 서버 안의 항목을 그대로 넘겨 동행 저장 흉내가 앱이 기억한 처음 코스까지 바꾼다. 실서버처럼 응답마다 새 사본을 주도록 src/api/dev-mock-course.ts를 고친다 per quickstart 2 (partial)
- [X] T015 마지막으로 고친 동행이 나간 동행이면 확인 상자 제목이 "다른 동행님이…"으로 나오는지 화면 테스트를 더한다 per Edge Cases 동행 이름 (partial)

## Phase 7: Review 1

- [X] T016 다시 연결 비교는 저장 중이면 건너뛰고, 최신 코스를 받는 사이 고친 내용을 잃지 않게 받은 뒤의 초안으로 비교하도록 course-edit-screen을 고치고 테스트를 더한다

## Phase 8: Review 2

- [X] T017 코스 보기 화면도 연결이 끊겼다 돌아오면 코스를 다시 받아 동행이 바꾼 코스를 보이도록 course-screen에 useReconnected를 붙이고 테스트를 더한다
