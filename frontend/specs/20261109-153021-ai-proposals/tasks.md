# Tasks: AI 변경안

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md), [contracts/routes.md](./contracts/routes.md)

**Tests**: 순수 규칙은 jest, 화면은 RNTL. 단계마다 `npx jest src/features/proposal`, `npx tsc --noEmit`, `npx eslint` 통과 뒤 체크한다.

## Phase 1: Foundational

- [X] T001 [P] 을·를 조사 withEulReul을 src/lib/korean.ts에 더하고 테스트
- [X] T002 [P] 장소 빼기 변경안, 적용, 되돌리기 API를 src/features/proposal/api.ts에
- [X] T003 [P] 비교 규칙(제안 초안, 비교 날, 요약, 숫자 칸, 줄 표시)을 proposal-rules.ts에 만들고 테스트. 예시 testing.ts
- [X] T004 [P] 코스 가짜 서버에 PLACE_REMOVED·WEATHER 결과, 적용, 되돌리기를 더한다

## Phase 2: User Story 1 - 비교하고 적용 (P1)

- [X] T005 [US1] 작업 만들기·기다리기와 적용 useProposal 훅과 테스트
- [X] T006 [US1] 비교 부품 ProposalCompare(요약, 숫자 칸, 지도, 목록, 아래 버튼)
- [X] T007 [US1] ProposalView와 ProposalScreen, 라우트 proposal.tsx, 화면 테스트

## Phase 3: User Story 2 - 되돌리기 (P1)

- [X] T008 [US2] S24에 applied 알림과 되돌리기, useUndo 훅, 테스트

## Phase 4: User Story 3 - 실패와 충돌 (P2)

- [X] T009 [US3] 재계산 실패 화면, 적용 409·422 안내와 다시 만들기, 테스트

## Phase 5: User Story 4 - 들어가기 (P2)

- [X] T010 [US4] S24 [빼기]와 S26 [변경안 보기]를 S29로 연결하고 테스트

## Phase 6: Polish

- [X] T011 미리보기 src/app/dev/proposal.tsx
- [X] T012 전체 테스트·타입·린트, Figma 비교, 테스트 모드 흐름
- [X] T013 spec 상태와 quickstart 정리
- [ ] T014 사용자 몫: 변경안 백엔드가 생기면 실서버 확인
- [ ] T015 사용자 몫: 안드로이드 기기 확인

## Phase 7: Review 1

- [X] T016 되돌린 뒤에도 "바뀐 코스가 지금 코스예요" 줄이 남는다. 되돌리면 줄을 숨기도록 course-screen을 고치고 테스트를 더한다

## Phase 8: Review 2

- [X] T017 적용 표시 주소값이 남아 코스 화면을 다시 열면 적용 알림이 또 뜬다. 알린 뒤 주소값을 지우도록 고치고 테스트를 더한다

## Phase 9: Review 3

- [X] T018 적용 직후 고친 사람 줄을 Figma처럼 "…님이 적용했어요"로 보이게 고친다
