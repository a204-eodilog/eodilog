# Tasks: 여행·채팅 일상 문제 고치기

**Input**: Design documents from `specs/20261111-095713-everyday-trip-chat-fixes/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: 새로 고칠 것마다 실패하는 테스트를 먼저 쓴다(FR-019). 먼저 고쳐 둔 변경은 붙어 있는 테스트로 확인한다.

**Organization**: 사용자 이야기별로 묶는다. 경로는 `frontend/` 기준이다.

## Phase 1: Setup

- [x] T001 작업 폴더의 먼저 고쳐 둔 변경을 최신 dev 위로 옮기고 브랜치 이름을 `fix/EODI-285-everyday-trip-chat`으로 바꾼다
- [x] T002 최신 dev에서 깨진 라우터 테스트 2개를 고친다: `src/features/invitation/open-joined-trip.test.tsx`, `src/features/trip/components/trip-gone-state.test.tsx`에서 알림 팝업 자리를 비운다

## Phase 2: Foundational (먼저 고쳐 둔 변경 확인과 커밋 — US5·US6·US7)

**Purpose**: 뒤 단계가 같은 파일을 고치므로, 먼저 고쳐 둔 변경을 요구사항과 맞춰 보고 묶음별로 커밋해 바탕을 깨끗이 한다.

- [x] T003 [US5] 끊김 안내와 당겨서 새로고침이 FR-012·FR-013과 맞는지 테스트로 확인하고 커밋한다: `src/components/ui/offline-notice.tsx`, `src/components/ui/index.ts`, `src/hooks/use-pull-refresh.ts`와 테스트, `src/features/trip/hooks/offline-open.test.tsx`, `src/features/trip/screens/trip-list-screen.tsx`, `src/features/trip/screens/trip-detail-screen.tsx`, `src/features/trip/hooks/use-my-trips.ts`, `src/features/trip/hooks/use-region-names.ts`와 테스트, `src/features/chat/hooks/use-chat-room.ts`, `src/features/chat/hooks/use-chat-rooms.ts`, `src/api/query-focus.ts`
- [x] T004 [US6] 닫은 만들기 화면 뒤의 이동·응답 놓친 저장·충돌 판정이 FR-014~FR-016과 맞는지 테스트로 확인하고 커밋한다: `src/features/trip/hooks/use-create-trip.ts`와 테스트, `src/features/trip/hooks/use-update-trip.ts`와 테스트, `src/features/trip/hooks/use-trip-edit-draft.ts`와 테스트, `src/features/trip/companion-rules.ts`와 테스트, `src/features/trip/trip-rules.ts`와 테스트, `src/features/trip/hooks/trip-cache.ts`와 테스트, `src/features/trip/screens/new-trip-screen.tsx`, `src/features/trip/screens/trip-settings-screen.tsx`, `src/features/trip/screens/invite-screen.tsx`
- [x] T005 [US7] 탭 화면 겹침이 FR-017과 맞는지 테스트로 확인하고 커밋한다: `src/lib/open-over-tabs.ts`, `src/features/invitation/open-joined-trip.ts`와 테스트, `src/features/invitation/invite-rules.ts`, `src/features/invitation/screens/invite-screen.tsx`, `src/features/preferences/screens/preferences-screen.tsx`, `src/features/trip/components/trip-gone-state.tsx`와 테스트, `src/app/(main)/_layout.tsx`
- [x] T006 [US7] 채팅의 먼저 고쳐 둔 변경(앱 복귀 때 목록 한 번 받기 FR-018, 오래된 보내는 중 메시지, 스크롤)을 테스트로 확인하고 커밋한다: `src/features/chat/chat-inbound.ts`와 테스트, `src/features/chat/resync-rooms.test.ts`, `src/features/chat/hooks/use-chat-outbox.ts`, `src/features/chat/hooks/use-messages.ts`와 테스트, `src/features/chat/hooks/use-send-message.ts`와 테스트, `src/features/chat/components/chat-room-view.tsx`, `src/features/chat/types.ts`, `src/features/chat/screens/chat-rooms-screen.tsx`와 테스트

파일 묶음은 파일 이름으로 짐작한 것이다. 커밋하기 전에 실제 변경을 보고, 한 파일에 두 묶음의 변경이 섞여 있으면 그 파일은 변경이 더 많은 묶음에 넣고 커밋 메시지에 적는다.

**Checkpoint**: 작업 폴더에 커밋 안 된 변경이 없다. 전체 jest·tsc·lint 통과.

## Phase 3: User Story 1 - 초대 링크로 들어온 뒤 바로 여행을 쓴다 (P1)

**Goal**: 자동 참여가 실패해도 "이동하는 중"에 갇히지 않는다.

**Independent Test**: 이미 동행인 초대를 열고 참여 요청을 실패시키면 [다시 시도], [홈으로]가 보인다.

- [x] T007 [US1] 실패하는 테스트를 쓴다: `src/features/invitation/screens/invite-screen.test.tsx`에 이미 동행 + 참여 요청 실패면 "이동하는 중"이 사라지고 "여행으로 이동하지 못했어요", [다시 시도], [홈으로]가 보인다, [다시 시도]가 성공하면 여행으로 간다, 자동 요청은 한 번만 나간다
- [x] T008 [US1] `src/features/invitation/screens/invite-screen.tsx`의 이미 동행 갈래에 이동 실패 안내를 더해 T007을 통과시킨다 (FR-002, FR-002a)

## Phase 4: User Story 2 - 비어 있던 대화방에서도 새 메시지가 바로 보인다 (P1)

**Goal**: 빈 창도 이어 받기와 마지막 메시지 확인이 돈다.

**Independent Test**: 빈 방을 연 채 받은 메시지 3개가 순서대로 보인다. 빈 창에서 이어 받기 요청이 1번 나간다.

- [x] T009 [US2] 실패하는 테스트를 쓴다: `src/features/chat/empty-room.test.ts`에 빈 창에서 `catchUp`이 요청 1번으로 그사이 온 메시지를 넣는다, `checkLatest`가 빈 창에서도 메시지를 찾아 넣는다, 빈 창에 실시간 메시지 3개가 순서대로 들어간다, 빈 창에서 보낸 내 첫 메시지가 한 번만 들어간다, 창이 없으면 여전히 아무것도 하지 않는다
- [x] T010 [US2] `src/features/chat/chat-inbound.ts`의 `catchUp`과 `checkLatest`가 빈 창을 처음 받기처럼 채우게 고쳐 T009를 통과시킨다 (FR-004, FR-005)

## Phase 5: User Story 3 - 대화방은 한 번만 열린다 (P2)

**Goal**: 대화방 목록의 누름을 한 번만 받는다.

**Independent Test**: 같은 방을 연달아 두 번 누르면 화면 이동이 1번이다.

- [x] T011 [P] [US3] 실패하는 테스트를 쓴다: `src/hooks/use-open-once.test.ts`에 연달아 두 번 부르면 한 번만 실행된다, 화면이 다시 앞으로 오면 풀린다, 1초 뒤에도 풀린다
- [x] T012 [US3] `src/hooks/use-open-once.ts`를 만들어 T011을 통과시킨다
- [x] T013 [US3] `src/features/chat/screens/chat-rooms-screen.test.tsx`에 같은 방 두 번·다른 방 누름에 `router.push`가 1번인 테스트를 더하고, `src/features/chat/screens/chat-rooms-screen.tsx`의 `open`에 `useOpenOnce`를 붙인다 (FR-006, FR-007)

## Phase 6: User Story 4 - 여행 메뉴를 누르면 무엇이든 보인다 (P2)

**Goal**: 네 메뉴의 원인을 기록하고 내 담당 원인을 고친다.

**Independent Test**: `menu-check.md`의 표와 실제 누른 결과가 같다.

- [x] T014 [US4] 테스트 모드 웹 미리보기에서 시험 데이터의 여행마다 코스·평가·경비·게시를 눌러 결과를 `specs/20261111-095713-everyday-trip-chat-fixes/menu-check.md`에 적는다 (FR-010)
- [x] T015 [US4] T014에서 코스 화면이나 시험 데이터(`src/api/dev-mock*.ts`)가 원인으로 나온 것을 고치고, 평가·경비 화면 코드가 원인인 것은 `menu-check.md`에 넘긴 것으로 적는다 (FR-008, FR-009, FR-011)

## Phase 7: Polish

- [x] T016 전체 `npx jest`, `npx tsc --noEmit`, `npx expo lint`를 통과시킨다 (SC-007)
- [x] T017 웹 미리보기에서 quickstart의 눌러 보기를 확인한다. 3번 여행 메뉴는 9개 여행을 모두 열어 봤고, 2번은 메시지가 있는 방에 가짜 메시지 3개가 순서대로 보이는 것까지 봤다. 시험 데이터에 빈 대화방이 없어 빈 방과 1번 두 번 누르기는 자동 테스트로만 확인했다
- [ ] T018 사용자 몫: 휴대폰에서 먼저 고쳐 둔 7가지와 이번에 고친 것을 확인한다 (quickstart "사용자가 휴대폰에서 확인할 것")
- [ ] T019 사용자 몫: 로컬 백엔드 실서버에서 초대 수락과 대화방을 확인한다

## Dependencies & Execution Order

- Phase 2가 끝나야 Phase 3~5를 시작한다. 같은 파일(`invite-screen.tsx`, `chat-inbound.ts`, `chat-rooms-screen.tsx`)을 고치기 때문이다.
- Phase 3, 4, 5는 서로 다른 파일이라 순서가 바뀌어도 된다. T011은 다른 작업과 파일이 겹치지 않는다.
- Phase 6은 조사(T014)가 먼저다.

## Implementation Strategy

1. Phase 2로 먼저 고쳐 둔 변경을 커밋해 바탕을 만든다.
2. P1 두 개(US1, US2)를 실패하는 테스트부터 고친다.
3. US3, US4를 한 뒤 전체 검사를 돌린다.

## Phase 8: Convergence

2026-11-11에 spec·plan·tasks와 코드를 대조했다. 코드에 빠진 것은 없었고 문서 두 곳을 코드에 맞췄다.

- [x] T020 spec의 이야기 6과 FR-014·SC-005를 코드에 맞춘다. 먼저 고쳐 둔 변경은 끊긴 동안의 요청을 막는 것이 아니라, 만들기 화면을 닫은 뒤에는 화면을 옮기지 않는 것이다 per FR-014 (contradicts)
- [x] T021 spec의 FR-012에서 끊김 안내가 붙은 화면을 실제와 맞춘다. 여행 목록·상세·설정·동행 초대이고 대화방 목록과 대화방은 아니다 per FR-012 (contradicts)
