---

description: "동행 초대·관리·나가기 구현 작업 목록"
---

# Tasks: 동행 초대·관리·나가기

**Input**: `specs/20261105-091142-trip-companions/`의 plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Branch**: `feat/EODI-194`

**Tests**: 사용자가 요청했다. 순수 로직과 캐시·409 처리마다 jest 단위 테스트 작업을 바로 뒤에 둔다. 화면은 단위 테스트하지 않고, 웹 미리보기와 기기에서 확인한다.

**Organization**: 사용자 요청 순서로 묶었다. 순서는 S18 초대(US1) → S19 정보 수정(US2) → S19 방장 메뉴(US4) → 나가기(US3)다. 스토리 번호는 spec.md와 같다. 방장 메뉴(US4)를 나가기(US3)보다 앞에 둔다. 방장이 나갈 때 쓰는 [다른 사람에게 넘기기]가 방장 넘기기 시트를 다시 쓰기 때문이다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일을 고치고, 끝나지 않은 작업에 기대지 않아 함께 할 수 있다.
- **[Story]**: spec.md의 사용자 스토리(US1~US4).
- **(1번 고침)**: 1번 명세(`specs/20261030-092912-trip-create-detail`, 여행 만들기·상세)에서 만든 파일을 고치는 작업이다.
- **(공통 고침)**: 다른 담당이 만들었거나 여러 기능이 함께 쓰는 파일을 고치는 작업이다.
- 경로는 모두 `frontend/` 기준이다.

---

## Phase 1: Setup (공통 준비)

**Purpose**: 타입과 오류 코드처럼 모든 작업이 쓰는 이름을 먼저 맞춘다.

- [X] T001 [P] `src/features/trip/types.ts`에 타입을 더한다 (1번 고침).
  - 더할 타입: `InvitationSecret`(`id`, `token`, `url`, `expiresAt`), `SavedInviteLink`(`url`, `expiresAt`), `UpdateTripBody`, `JobRef`(`jobId`, `status: 'QUEUED'`, `statusUrl`).
  - 칸과 null 여부는 contracts/companions-api.md §1·§4·§8과 data-model.md를 그대로 따른다.
  - `LeaveResult`의 `cleanupJobId` 설명을 "여행 삭제(TRIP_DELETE) 또는 내 채팅 정리(LEAVE_CLEANUP) 작업 ID, 없으면 null"로 고친다.
- [X] T002 [P] `src/api/errors.ts`의 `API_ERROR`에 `FORBIDDEN`·`MEMBER_NOT_FOUND`를 더한다 (1번 고침). 코드 이름은 백엔드 `CommonErrorCode.FORBIDDEN`, `TripErrorCode.MEMBER_NOT_FOUND`와 같다.

---

## Phase 2: Foundational (모든 스토리가 기대는 기반)

**Purpose**:

- 서버 API 함수
- 실패 분류(409·403·404)
- 방장 여부·이어받을 사람·혼자 남음 판단
- 캐시 갱신·여행에서 빠지기
- 초대 링크 저장

**⚠️ CRITICAL**: 이 단계가 끝나야 스토리 작업을 시작한다.

### API 함수

- [X] T003 `src/features/trip/api.ts`에 함수 6개를 더한다 (1번 고침).
  - 더할 함수: `createInvitation(tripId)`, `cancelInvitations(tripId)`, `updateTrip(tripId, body)`, `transferOwner(tripId, { targetMemberId, expectedVersion })`, `removeMember(tripId, memberId, expectedVersion)`, `deleteTrip(tripId, expectedVersion)`.
  - 경로, 방식, 본문, 응답은 contracts/companions-api.md §1·2·4·5·6·8과 같다. 내보내기와 삭제는 `expectedVersion`을 쿼리 문자열로 보낸다.
  - 이미 있는 `leaveTrip`의 설명에서 "메시지 지우기는 true면 400"을 지운다. 대신 "사진 지우기만 true면 400, 메시지 지우기는 LEAVE_CLEANUP 작업으로 202"로 쓴다.

### 판단 규칙 (순수 함수)

- [X] T004 [P] `src/features/trip/companion-rules.ts`를 새로 만든다.
  - 상수: `TRIP_CAPACITY = 20`.
  - 함수 9개: `myMember(trip, meId)`, `tripRole(trip, meId)`, `isAlone(trip)`, `nextOwner(trip, myMemberId)`, `pickableMembers(trip, myMemberId)`, `settingsActions(role, memberCount)`, `canInvite(memberCount)`, `memberLabel(member, trip, meId)`, `memberActionFailure(error)`.
  - 규칙은 data-model.md "앱이 계산하는 것" 표와 research.md R4·R7·R8·R12를 따른다.
  - `nextOwner`·`pickableMembers`는 배열 순서가 아니라 `joinOrder`로 정렬한다.
  - `settingsActions`는 방장이 혼자면 넘기기·내보내기를 `disabled: true`로 둔다. 이유는 각각 "넘길 동행이 없어요", "내보낼 동행이 없어요"다.
  - `memberActionFailure`는 `apiErrorCode`(`src/api/errors.ts`)로 코드를 읽는다.
- [X] T005 [P] `src/features/trip/companion-rules.test.ts`에 T004 테스트를 쓴다. plan.md "단위 테스트로 증명할 것"의 다섯 묶음을 모두 넣는다.
  - 방장 여부와 메뉴
  - 이어받을 사람(섞인 배열, 다시 참여해 `joinOrder`가 큰 사람 포함)
  - 혼자 남음
  - 정원 19·20명
  - 실패 분류: 409·403·404 두 가지, 네트워크, 시간 초과, 500

### 캐시와 여행에서 빠지기

- [X] T006 `src/features/trip/hooks/trip-cache.ts`를 새로 만든다. 함수는 셋이다(research R5).
  - `invalidateTripLists(queryClient)`: `MY_TRIPS_KEY`와 `['me','trips']`를 무효화한다.
  - `refreshTripAfterConflict(queryClient, tripId)`: `refetchQueries({ queryKey: tripKey(tripId), exact: true })`를 기다린 뒤 최신 `Trip`을 돌려준다.
  - `forgetTrip(queryClient, tripId)`: `cancelQueries`를 한 뒤 `removeQueries({ queryKey: ['trips', tripId] })`를 하고, 마지막에 `invalidateTripLists`를 부른다.
- [X] T007 [P] `src/features/trip/hooks/trip-cache.test.ts`에 T006 테스트를 쓴다. 실제 `QueryClient`로 확인한다.
  - `forgetTrip`은 `['trips',id]`·`['trips',id,'expenses']`·`['trips',id,'invite']`를 지운다.
  - 다른 여행과 `['trips','mine']`의 데이터는 남는다.
  - `invalidateTripLists`는 두 목록 키를 모두 무효화한다.
- [X] T008 `src/features/trip/hooks/use-create-trip.ts`가 `MY_TRIPS_KEY`만 무효화하던 것을 `invalidateTripLists(queryClient)`로 바꾼다 (1번 고침). 다른 팀원의 N4 목록(`['me','trips']`)도 새로 받게 된다.

### 초대 링크 저장

- [X] T009 [P] `src/features/trip/invite-storage.ts`를 새로 만든다(research R1).
  - 보안 저장소 키는 `eodilog.invites`이고, 저장 모양은 `{ userId, links: { [tripId]: { url, expiresAt } } }`다. `src/lib/secure-storage.ts`를 쓴다.
  - 함수: `readInviteLink(userId, tripId, now)`, `saveInviteLink(userId, tripId, link, now)`, `forgetInviteLink(tripId)`, `clearInviteLinks()`.
  - 읽기: 다른 사용자거나 `now >= Date.parse(expiresAt)`면 `null`.
  - 저장: 만료된 다른 항목을 함께 지운다. 사용자가 바뀌었으면 이전 사용자의 링크를 통째로 버린다.
  - 저장소 JSON이 깨졌으면 비어 있는 것으로 본다.
  - 만료 판단은 `isInviteExpired(link, now)`로 따로 내보낸다.
- [X] T010 [P] `src/features/trip/invite-storage.test.ts`에 T009 테스트를 쓴다. `secure-storage`는 메모리 가짜로 바꾼다.
  - 같은 사용자는 그대로 읽는다. 다른 사용자는 `null`이다.
  - 만료 1초 전은 있고, 정각은 없다.
  - 저장할 때 만료된 항목을 지운다. 여행 하나를 지워도 나머지는 남는다.
  - `clearInviteLinks`는 전부 지운다. 깨진 JSON은 빈 값이다.
- [X] T011 `src/stores/session-store.ts`의 `clearSession`에서 `clearInviteLinks()`를 부른다 (공통 고침). 로그아웃과 토큰 만료 모두에 적용된다. 실패해도 로그아웃은 막지 않는다(`catch`로 무시). FR-033.
- [X] T012 `src/features/trip/hooks/trip-cache.ts`에 `exitTrip(queryClient, tripId)`를 더한다. 나가기·삭제 뒤 공통 이동이다.
  - 순서: `router.dismissAll()` → `router.replace('/trips')` → `forgetTrip` → `forgetInviteLink(tripId)`.
  - `dismissAll`의 이름과 동작은 SDK 58 expo-router 문서(`https://docs.expo.dev/versions/v58.0.0/sdk/router/`)로 먼저 확인한다(contracts/routes.md).

### 웹 테스트 모드

- [X] T013 `src/api/dev-mock.ts`에 새 API 7개의 가짜 응답을 넣는다 (1번 고침, research R15).
  - 대상: 초대 만들기·취소, PATCH, 넘기기, 내보내기, 나가기, 삭제.
  - 변경 요청은 `expectedVersion`이 지금 `version`과 다르면 409 `VERSION_CONFLICT`를 준다. 방장 전용 요청은 방장이 아니면 403 `FORBIDDEN`을 준다. 성공하면 `version`을 하나 올린다.
  - 가짜 여행 하나는 멤버 20명으로 둔다(quickstart 1-9).
  - 다른 동행이 수정한 상황을 흉내 내도록, 개발 메뉴나 함수 하나로 `version`만 올릴 수 있게 한다.

**Checkpoint**: `npx jest`가 T005·T007·T010을 포함해 통과한다. 이제 스토리 작업을 시작할 수 있다.

---

## Phase 3: User Story 1 - 초대 링크로 동행 부르기 (Priority: P1) 🎯 MVP

**Goal**: S18에서 링크를 만들고, 카카오톡으로 보내거나 복사하고, 새로 만들거나 취소한다. 함께하는 사람을 참여 순서로 본다.

**Independent Test**: 여행 상세 → 초대 버튼 → [링크 만들기] → 나갔다 다시 들어와도 같은 링크인지 본다. 이때 `POST /invitations` 추가는 0건이어야 한다. [새 링크 만들기]·[링크 취소] 뒤 예전 토큰으로 미리보기를 보내면 410이다(quickstart 1-1~1-3, 1-6~1-8).

### Tests for User Story 1

- [X] T014 [P] [US1] `src/features/trip/invite-storage.test.ts`에 `inviteExpiryLabel` 테스트를 더한다. `2026-11-11T15:00:00Z`는 "11.12(목)까지 쓸 수 있어요", `2026-11-11T14:59:59Z`는 "11.11(수)까지 쓸 수 있어요"다.

### Implementation for User Story 1

- [X] T015 [P] [US1] `src/features/trip/invite-storage.ts`에 `inviteExpiryLabel(expiresAt)`를 더한다. `seoulToday(new Date(expiresAt))`로 서울 날짜를 구하고 `src/lib/seoul-date.ts`의 `formatDay`로 표시한다(research R11). US2가 고치는 `companion-rules.ts`와 겹치지 않게 이 파일에 둔다.
- [X] T016 [US1] `src/features/trip/hooks/use-invite-link.ts`를 새로 만든다.
  - **읽기**: `useQuery(['trips', tripId, 'invite'])`가 `readInviteLink(me.id, tripId, new Date())`를 읽는다. 앱이 다시 앞으로 오면 다시 읽어 만료를 반영한다. `focusManager`가 이미 연결돼 있다.
  - **`create`**: `createInvitation`을 부르고 `saveInviteLink`로 저장한 뒤 `setQueryData`한다.
  - **`cancel`**: `cancelInvitations`를 부르고 `forgetInviteLink`로 지운 뒤 `setQueryData(null)`한다.
  - 화면에 들어올 때 서버를 부르지 않는다(FR-002).
- [X] T017 [P] [US1] `src/features/trip/components/member-row.tsx`를 새로 만든다(피그마 S18 함께하는 사람 줄).
  - `Avatar`(사진이 없으면 첫 글자, 나는 `me`), 닉네임, 오른쪽 `Tag`로 `memberLabel` 결과("방장", "나")를 보인다.
  - 토큰과 공통 부품만 쓴다.
- [X] T018 [US1] `src/features/trip/screens/invite-screen.tsx`에 `TripInviteScreen`을 새로 만든다. A의 `features/invitation/screens/invite-screen.tsx`와 내보내는 이름이 겹치지 않게 한다.
  - **화면 모양**: 피그마 S18 세 상태를 따른다(research R13).
    - 기본: 머리줄 "동행 초대", 여행 이름과 만료 줄, [카카오톡]·[링크 복사] 둥근 버튼, 링크 칸, "새로 만들면 전에 보낸 링크는 못 써요" · [링크 취소] · [새 링크 만들기], "함께하는 사람 {n}명", `MemberRow` 목록.
    - 링크 없음: "아직 만든 링크가 없어요", 공유 버튼 흐리게, [링크 만들기].
    - 링크 만들기 실패: 오류 띠.
  - **[카카오톡]**: `Share.share({ message: '{여행 이름}에 함께 가요\n{url}' })`. 공유 창을 닫아도 오류가 아니다.
  - **[링크 복사]**: `expo-clipboard`의 `setStringAsync(url)` 뒤 `toast.success('링크를 복사했어요')`.
  - **[새 링크 만들기]·[링크 취소]**: `ConfirmSheet`로 먼저 묻는다(FR-006·FR-007).
  - **가득 참**: `canInvite`가 `false`면 안내를 띄우고 만들기·카카오톡·복사를 막는다. 취소는 둔다(FR-009).
  - **여행 정보**: `useTrip`으로 받는다. 404는 `notFound`로 "볼 수 없는 여행이에요"와 [여행 목록으로]를 보인다(FR-031). 그 밖의 실패는 `ErrorState`다.
  - **응답 처리**: 만들기·취소 요청이 404 `TRIP_NOT_FOUND`면 `forgetInviteLink` 뒤 같은 안내를 보인다.
- [X] T019 [US1] `src/app/(main)/trips/[tripId]/invite.tsx` 라우트 파일을 만들어 `TripInviteScreen`을 내보낸다. 그다음 개발 서버를 한 번 켜서 typed route 타입(`.expo/types/router.d.ts`)을 새로 만든다.
- [X] T020 [US1] `src/features/trip/components/trip-hero.tsx`의 초대 버튼(`accessibilityLabel="동행 초대"`)을 바꾼다 (1번 고침). `comingSoon` 대신 `router.push(`/trips/${trip.id}/invite`)`로 보낸다. 주소에 `index`를 붙이지 않는다.

**Checkpoint**: 웹 테스트 모드에서 quickstart 1-1~1-3, 1-6~1-9가 통과한다.

---

## Phase 4: User Story 2 - 여행 정보 고치기 (Priority: P2)

**Goal**: S19에서 누구나 이름·기간·여행지를 고치고 [완료] 한 번으로 저장한다. 409면 최신 값을 다시 보여 준다.

**Independent Test**: 기간·여행지가 없는 여행에서 기간과 여행지를 넣고 [완료]를 누르면, 상세의 큰 제목과 '지금 할 일'이 바뀐다. 두 사람이 함께 열고 차례로 저장하면 뒤 사람이 409 안내와 최신 값을 본다(quickstart 2-1~2-6).

### Tests for User Story 2

- [X] T021 [P] [US2] `src/features/trip/companion-rules.test.ts`에 `buildTripUpdate` 테스트를 더한다. 경우는 다음과 같다.
  - 바뀐 칸만 담긴다.
  - 이름 앞뒤 공백을 지운다.
  - 기간을 비우면 `startDate`·`endDate`가 둘 다 `null`이다.
  - 여행지를 모두 빼면 `[]`이다.
  - 여행지 순서만 바뀌어도 바뀐 것으로 본다.
  - 바뀐 게 없으면 `null`이다.
  - `expectedVersion`은 언제나 들어간다.
- [X] T022 [P] [US2] `src/features/trip/hooks/use-update-trip.test.ts`를 새로 만든다. `api.updateTrip`을 가짜로 바꾸고 실제 `QueryClient`로 확인한다.
  - 성공하면 `['trips',id]`가 응답 여행으로 바뀌고 목록 키가 무효화된다.
  - 409면 여행을 다시 받고, `useTripEditDraft`가 최신 값으로 다시 채워지며, `updateTrip`은 한 번만 불린다(자동 재시도 없음).
  - 네트워크 실패면 draft가 그대로다.
  - 수정 중 캐시의 여행이 새 버전으로 바뀌어도 draft의 값과 `base`는 그대로다. 저장할 때 보낸 `expectedVersion`은 `base.version`이다. 서버가 409를 주면 최신 값으로 다시 채운다(SC-003).

### Implementation for User Story 2

- [X] T023 [P] [US2] `src/features/trip/companion-rules.ts`에 `buildTripUpdate(base, draft)`를 더한다(research R6, data-model `UpdateTripBody`). `base`는 수정을 시작한 때의 여행이다. `base`와 비교해 바뀐 칸만 담고 `expectedVersion`은 `base.version`이다. 캐시의 최신 여행을 넘기지 않는다.
- [X] T024 [US2] 수정 입력 스토어를 만든다.
  - `src/features/trip/hooks/use-new-trip-draft.ts`에서 이름·기간·여행지 칸과 `setTitle`·`setRange`·`addRegion`(같은 지역은 한 번만)·`removeRegion`을 공통 조각 `tripDraftFields`로 뽑는다. 새 여행 스토어의 동작은 그대로다 (1번 고침).
  - `src/features/trip/hooks/use-trip-edit-draft.ts`에 zustand 스토어를 새로 만든다. 칸은 `tripDraftFields` + `base: Trip | null`이고, 동작은 `fill(trip, regions)`, `reset()`이다.
  - `fill`은 부르면 언제나 덮어쓰고 `base`를 그 여행으로 바꾼다. 언제 부를지는 화면이 정한다(T028·T027).
- [X] T025 [US2] `src/features/trip/screens/region-search-screen.tsx`가 `draft?: 'new' | 'edit'`(기본 'new')를 받게 바꾼다 (1번 고침).
  - 화면 안에서 `useNewTripDraft()`와 `useTripEditDraft()`를 언제나 둘 다 부르고, `draft` 값으로 하나를 골라 `regions`·`addRegion`·`removeRegion`을 쓴다.
  - 훅을 속성으로 넘기거나 조건에 따라 부르지 않는다(훅 규칙, React Compiler).
  - `src/app/(main)/trips/new-region.tsx`는 그대로 둔다(기본 'new').
- [X] T026 [US2] `src/app/(main)/trips/[tripId]/settings-region.tsx`를 만든다. `<RegionSearchScreen draft="edit" />`를 그리는 컴포넌트를 내보낸다. 그다음 개발 서버를 켜서 typed route 타입을 새로 만든다. 그래야 T028의 `router.push`가 tsc를 통과한다.
- [X] T027 [US2] `src/features/trip/hooks/use-update-trip.ts`를 새로 만든다.
  - `mutate(draft)`: `buildTripUpdate`가 `null`이면 요청 없이 `{ unchanged: true }`로 끝난다.
  - 성공: `setQueryData(tripKey, trip)`, `invalidateTripLists`.
  - 실패는 `memberActionFailure`로 나눈다.
    - conflict: `refreshTripAfterConflict` → `useTripEditDraft.fill(최신 여행)` → `toast.show('다른 동행이 먼저 고쳤어요. 최신 내용을 보여 드릴게요')`.
    - tripGone: 화면이 '볼 수 없는 여행'을 보이게 한다.
    - error: draft를 둔다.
- [X] T028 [US2] `src/features/trip/screens/trip-settings-screen.tsx`에 `TripSettingsScreen`을 새로 만든다. 이 단계에서는 정보 수정과 구성원까지 만든다(피그마 S19 '동행이 볼 때'·'저장 실패').
  - **화면 모양**:
    - 머리줄 "여행 설정"과 오른쪽 [완료].
    - "여행 이름" `TextField`: 1~200자, 비면 "여행 이름을 입력해 주세요".
    - 기간 줄: 누르면 `DateRangeSheet`가 열린다. 비울 수 있다.
    - 여행지 줄: 누르면 `/trips/{id}/settings-region`으로 간다.
    - "구성원 {n}명" 얼굴 줄.
  - **입력 상태**: `base`가 없거나 다른 여행일 때만 `fill`한다. 즉 처음 열 때 한 번이다. 여행과 `useRegionNames`의 지역 이름이 모두 준비된 뒤에 부른다. 수정 중 여행이 다시 받아져도 다시 부르지 않는다(research R6). 닫힐 때(`useEffect` 정리) `reset`한다. 1번 `new-trip-screen.tsx`와 같은 방식이다.
  - **[완료]**: 성공하거나 바뀐 게 없으면 `router.back()`한다. 실패하면 맨 위에 빨간 띠 "여행 정보를 저장하지 못했어요"를 띄운다.
  - **메뉴 줄**: `settingsActions(tripRole(...), members.length)` 결과를 그린다. 이 단계에서는 누르면 `toast.show('준비 중이에요')`다. US4·US3에서 바꾼다. 동행에게 방장 줄이 없는 것은 이 단계부터 맞아야 한다(FR-016).
  - **404**: '볼 수 없는 여행' 화면이다(FR-031).
- [X] T029 [US2] `src/app/(main)/trips/[tripId]/settings.tsx` 라우트 파일을 만들어 `TripSettingsScreen`을 내보낸다. 그다음 typed route 타입을 새로 만든다.
- [X] T030 [US2] `src/features/trip/components/trip-hero.tsx`의 "여행 설정" 버튼을 바꾼다 (1번 고침). `comingSoon` 대신 `router.push(`/trips/${trip.id}/settings`)`로 보낸다. 다른 곳에서 `comingSoon`을 쓰지 않으면 정의를 지운다.

**Checkpoint**: 웹 테스트 모드에서 quickstart 2-1~2-6이 통과한다. 2-5는 테스트 모드의 버전 올리기로 흉내 낸다.

---

## Phase 5: User Story 4 - 방장이 동행 관리하기 (Priority: P3)

**Goal**: 방장만 S19에서 방장 넘기기·동행 내보내기·여행 삭제를 한다. 넘긴 뒤에는 동행 화면으로 바뀐다. 그 사이 여행이 바뀌었으면 최신 화면을 보여 준다.

**Independent Test**: 방장과 동행 계정으로 S19를 열어 메뉴가 다른지 본다. 방장이 B에게 넘기면 두 화면이 서로 바뀐다. 내보낸 동행의 목록에서 여행이 빠진다. 삭제하면 모두의 목록에서 빠진다(quickstart 4-1~4-6).

### Tests for User Story 4

- [X] T031 [P] [US4] `src/features/trip/hooks/use-member-actions.test.ts`를 새로 만든다. API는 가짜로 바꾸고 실제 `QueryClient`로 확인한다.
  - **넘기기 성공**: `['trips',id]`의 `ownerMemberId`가 바뀌고 목록 키가 무효화된다.
  - **409와 403**: 여행을 다시 받는다. 요청은 한 번만 보낸다.
  - **내보내기**: `MEMBER_NOT_FOUND`면 memberGone으로 나누고 여행을 다시 받는다.
  - **삭제**: 404면 성공으로 본다.

### Implementation for User Story 4

- [X] T032 [US4] `src/features/trip/hooks/use-member-actions.ts`를 새로 만든다. 훅은 셋이다. 모두 화면이 그린 `trip.version`을 `expectedVersion`으로 받는다.
  - **`useTransferOwner`**: 성공하면 `setQueryData(tripKey, trip)`와 `invalidateTripLists`.
  - **`useRemoveMember`**: 성공하면 `invalidateQueries(tripKey, exact)`와 `invalidateTripLists`.
  - **`useDeleteTrip`**: 404 `TRIP_NOT_FOUND`를 성공으로 바꾼다. `useLeaveTrip`의 `leaveTripOrGone`과 같은 방식이다.
  - **실패**: `memberActionFailure`로 나누어 알린다.
    - conflict·notOwner: `refreshTripAfterConflict` 뒤 안내. conflict는 "그 사이 여행이 바뀌었어요", notOwner는 "방장만 할 수 있어요".
    - memberGone: "이미 여행에 없는 동행이에요" 안내와 여행 다시 받기.
    - 넘기기 400 `VALIDATION_ERROR`(대상이 참여 중이 아니거나 이미 방장): error로 보고 여행을 다시 받는다(contracts §5).
- [X] T033 [P] [US4] `src/features/trip/components/member-pick-sheet.tsx`를 새로 만든다(피그마 S19 '방장 넘기기 대상 선택').
  - 공통 `BottomSheet`에 `pickableMembers` 결과를 라디오 줄로 보인다. 각 줄은 닉네임과 "{MM.DD} 참여"이고, 첫 줄에는 " · 가장 먼저 참여"를 붙인다.
  - `mode: 'handover' | 'kick'`에 따라 제목·설명·버튼을 바꾼다.
    - handover: "방장을 누구에게 넘길까요?" / "넘기면 내보내기·삭제는 새 방장만 할 수 있어요" / "{닉네임}님에게 넘기기"
    - kick: "누구를 내보낼까요?" / "내보낸 동행은 이 여행을 더 볼 수 없어요. 경비 기록은 남아요" / "{닉네임}님 내보내기"
  - 처음엔 아무도 고르지 않은 상태라 버튼을 누를 수 없다. `loading`과 `error` 속성을 받는다.
- [X] T034 [US4] `src/features/trip/screens/trip-settings-screen.tsx`에 방장 메뉴 세 줄을 연결한다.
  - **[방장 넘기기]**: `MemberPickSheet`(handover)를 열고 `useTransferOwner`를 부른다. 확인창은 따로 두지 않는다(FR-018). 성공하면 시트를 닫는다. 여행이 다시 그려지면서 동행 화면으로 바뀐다(FR-019). 넘기기 시트가 어디서 열렸는지(S19 메뉴인지 나가기 시트인지)를 화면 상태로 기억한다. T037이 쓴다.
  - **[동행 내보내기]**: `MemberPickSheet`(kick)로 고른 뒤, `ConfirmSheet`로 "{닉네임}님을 내보낼까요?"를 묻는다. 확인하면 `useRemoveMember`를 부른다(FR-021).
  - **[여행 삭제]**: `ConfirmSheet`("여행을 삭제할까요?", "모든 동행에게서 여행이 사라져요. 되돌릴 수 없어요", 빨간 버튼 "삭제하기", 아이콘 `trash`)로 묻는다. `useDeleteTrip` 성공 뒤 `toast.show('여행을 삭제했어요')`를 띄우고 `exitTrip`한다(FR-022).
  - **충돌·권한 실패**: 열린 시트를 닫고 최신 화면을 보인다. 더는 방장이 아니면 메뉴가 사라진다(FR-023).

**Checkpoint**: 웹 테스트 모드에서 quickstart 4-1~4-6이 통과한다. 4-5는 테스트 모드에서 방장을 바꿔 흉내 낸다.

---

## Phase 6: User Story 3 - 여행 나가기 (Priority: P2)

**Goal**: S19 [여행에서 나가기]가 S50 확인 시트를 연다. 시트에는 내 채팅 삭제 체크와 경비 유지 안내가 있다. 방장이면 이어받을 사람을, 혼자면 여행 삭제 안내를 보인다. 나간 뒤에는 여행 목록으로 가고 그 여행에 다시 들어갈 수 없다.

**Independent Test**: A·B·C 여행에서 A가 나가면 시트에 "B님이 방장이 돼요"가 보인다. 나간 뒤 A의 목록에서 여행이 빠지고, 뒤로 가기로 돌아가지 않으며, B의 S19가 방장 화면이다. 혼자 남은 여행에서 나가면 삭제된다(quickstart 3-1~3-7).

### S50 시트: B의 컴포넌트 쓰기

- [X] T035 [US3] B가 dev에 머지한 `src/features/trip/components/leave-trip-sheet.tsx`를 고친다 (공통 고침, B 컴포넌트, research R9).
  - `cleanupSupported`를 두 속성으로 나눈다.
    - `showPhotos`(기본 `false`): 사진 줄과 체크를 숨긴다. 숨기면 `deleteOwnPhotos`는 언제나 `false`다.
    - `messageCleanupSupported`(기본 `true`): 채팅 체크를 켤 수 있게 한다.
  - 혼자 남았을 때는 지금처럼 체크 없이 "그룹 채팅방이 사라져요"를 보인다.
  - 예시 화면 `src/app/dev/ui.tsx` 506행의 `cleanupSupported`도 새 속성으로 바꾼다.
- [X] T036 [P] [US3] `src/features/trip/components/leave-trip-sheet.test.tsx`를 새로 만든다. @testing-library/react-native로 렌더해 확인한다.
  - `showPhotos=false`면 사진 줄이 없다.
  - 채팅 체크를 켜고 [나가기]를 누르면 `onConfirm`이 `{ deleteOwnPhotos: false, deleteOwnMessages: true }`를 받는다.
  - `alone`이면 체크가 없고 버튼이 "나가고 여행 삭제"다.
  - `nextOwnerName`과 `onHandOver`가 있으면 "다른 사람에게 넘기기"를 누를 수 있다.
- [X] T037 [US3] `src/features/trip/screens/trip-settings-screen.tsx`의 [여행에서 나가기]를 `LeaveTripSheet`와 `useLeaveTrip`(B의 훅, 그대로 사용)에 연결한다.
  - **시트에 넘기는 값**:
    - `tripTitle`
    - `alone={isAlone(trip)}`
    - `nextOwnerName`: 내가 방장이고 혼자가 아닐 때만 `nextOwner(trip, my.id)?.user.nickname`.
    - `onHandOver`: 내가 방장일 때만. 나가기 시트를 닫고 T034의 넘기기 시트를 '나가기에서 열림'으로 연다. 넘기기가 성공하면 나가기 시트를 다시 연다. 이때 나는 동행이라 `nextOwnerName`·`onHandOver`가 없다. 넘기기 시트를 닫으면 S19에 남는다(spec US3-4).
    - `loading={leave.isPending}`
    - `failure`: `leaveTripFailure(leave.error)`
  - **[나가기]**: `{ tripId, expectedVersion: trip.version, ...options }`로 `mutate`한다.
  - **conflict**: `refreshTripAfterConflict` 뒤 시트를 연 채로 최신 이어받을 사람·혼자 여부를 다시 그린다(FR-029, quickstart 3-5).
  - **성공**(`null` 포함): `tripDeleted`면 "여행을 삭제했어요", 아니면 "{여행 이름}에서 나왔어요" 토스트를 띄우고 `exitTrip`한다. 정리 작업은 기다리지 않는다(FR-028).

### S50 시트: 머지 전 임시 시트 (조건부)

- [X] T038 [US3] (조건부, 건너뛸 수 있음) **B 시트 사용**: 2026-11-05 구현 때 `git log`로 `b191c1f`가 작업 브랜치에 있는 것을 확인해 임시 시트를 만들지 않았다. `src/features/trip/components/leave-trip-sheet.tsx`가 작업 브랜치에 없을 때만 임시 시트를 만든다.
  - 같은 파일 이름에 `LeaveTripSheetProps`와 같은 속성(T035에서 나눈 속성 포함)으로 `ConfirmSheet` 위에 만든다. 화면 코드는 바꾸지 않고 B의 시트로 바꿀 수 있어야 한다.
  - 2026-11-05에 확인했을 때 B의 시트(`b191c1f`·`c698645`, EODI-179)는 이미 dev에 있다. 그래서 지금은 할 일이 없다. 시작할 때 `git log -- src/features/trip/components/leave-trip-sheet.tsx`로 한 번 더 확인하고, 있으면 [X]로 닫고 "B 시트 사용"이라고 적는다.

**Checkpoint**: 웹 테스트 모드에서 quickstart 3-1·3-2·3-4~3-7이 통과한다. 3-3(뒤로 가기)은 기기에서 확인한다.

---

## Phase 7: Polish & 마무리

**Purpose**: 검사, 실서버 확인, 함께 일하는 사람에게 알리기. 기기 확인은 맨 마지막 작업으로 따로 둔다.

- [X] T039 `frontend/`에서 `npx tsc --noEmit`, `npx expo lint`, `npx jest`를 모두 통과시킨다. 실패하면 고친 뒤 다시 돌린다.
- [ ] T040 로컬 백엔드(`EodiLog/dev-up.cmd`)와 웹 실서버 모드(`.claude/launch.json`의 `expo-web-live`)로 quickstart 1·2·4와 3-1·3-2·3-4~3-7을 확인한다.
  - B 계정은 `POST /invitations/{token}/accept`로 참여시킨다.
  - 측정 기록 표의 "S18 재진입 발급 수"와 "S19 진입 요청 수", "동시 수정 덮어쓰기"(5번) 값을 `specs/20261105-091142-trip-companions/quickstart.md`에 적는다.
  - 테스트 데이터는 로컬 DB에만 남긴다.
- [ ] T041 [P] `docs/design/screens/S50-confirm.md` 9·65행의 "곧 지원돼요" 설명을 바꾼다 (공통 고침, B 문서). 새 설명은 "채팅 지우기는 켬, 사진 줄은 사진 기능 전까지 숨김"이다. 고치기 전에 B(tpdms3048)에게 T035의 속성 변경과 함께 알리고 동의를 받는다. 동의 전이면 MR 설명에만 적는다.
- [X] T042 [P] MR 설명에 넣을 공유 사항을 정리한다. 기록할 파일은 `specs/20261105-091142-trip-companions/quickstart.md` 끝 "팀에 알릴 것" 절이다.
  - 피그마와 다르게 한 곳: [링크 취소] 자리 추가, 동행 화면의 [여행 삭제] 빼기.
  - S19 구성원 얼굴 줄에는 방장 표시가 없고, 방장은 S18 목록에서 본다는 것(명세 FR-019).
  - 초대 url이 `ieohaeng://` 앱 주소라 카카오톡에서 눌리지 않을 수 있다는 점.
- [ ] T043 안드로이드 기기 확인 (마지막). 개발 빌드에서 quickstart 중 기기에서만 볼 수 있는 항목을 확인한다.
  - 1-4: 카카오톡 공유 창과 문구
  - 1-5: 복사한 링크 붙여넣기
  - 1-3: 앱을 껐다 켠 뒤 같은 링크
  - 3-3: 나간 뒤 뒤로 가기로 나간 여행에 돌아가지 않음
  - 하단 시트와 내비게이션 바가 겹치지 않음
  - 측정 기록 표의 "[나가기] → 여행 탭 목록 표시 시간"을 200·202 경우로 나눠 5번씩 잰다.

  결과를 quickstart.md 측정 기록 표에 적는다. 휴대폰에서 공유받은 링크를 눌러 앱이 열리는지는 A의 S04 범위라 기록만 한다.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 바로 시작한다. T001·T002는 함께 할 수 있다.
- **Foundational (Phase 2)**: Setup 뒤에 한다. 모든 스토리를 막는다.
  - T003은 T001에 기댄다.
  - T004는 T002에 기댄다(오류 코드).
  - T006은 T003의 타입에 기댄다.
  - T012는 T006과 T009에 기댄다.
  - T008은 T006에 기댄다.
- **US1 (Phase 3)**: Foundational 뒤.
- **US2 (Phase 4)**: Foundational 뒤. US1과 따로 할 수 있다. 다만 T020과 T030이 같은 파일(`trip-hero.tsx`)이라 둘은 차례로 한다.
- **US4 (Phase 5)**: US2의 T028(S19 화면)에 기댄다.
- **US3 (Phase 6)**: US2의 T028에 기댄다. T037의 [다른 사람에게 넘기기]는 US4의 T033·T034에 기댄다.
- **Polish (Phase 7)**: 원하는 스토리가 끝난 뒤. T043(기기 확인)은 언제나 맨 마지막이다.

### User Story Dependencies

- **US1 (P1)**: 다른 스토리에 기대지 않는다. MVP다.
- **US2 (P2)**: 다른 스토리에 기대지 않는다. S19 화면 틀을 만든다.
- **US4 (P3)**: US2의 S19 화면 위에 메뉴를 붙인다.
- **US3 (P2)**: US2의 S19 화면 위에 붙인다. 방장 나가기의 넘기기 링크만 US4를 쓴다. US4 없이 하면 `onHandOver`를 넘기지 않는다.

### Within Each User Story

- 테스트 작업과 그 대상 순수 함수는 같은 단계에서 함께 끝낸다. 테스트를 먼저 쓰고 실패를 본 뒤 구현해도 된다.
- 순서: 규칙 → 훅 → 부품 → 화면 → 라우트 → 1번 화면 연결.

### Parallel Opportunities

- Phase 1: T001, T002
- Phase 2: T004+T005, T007, T009+T010은 서로 다른 파일이다. T003·T006을 먼저 하면 나머지를 함께 할 수 있다.
- US1: T014+T015, T017
- US2: T021+T023, T022. T024는 1번 파일(`use-new-trip-draft.ts`)도 고쳐서 따로 표시하지 않는다.
- US1과 US2를 함께 해도 같은 파일을 고치지 않는다. US1의 규칙은 `invite-storage(.test).ts`, US2의 규칙은 `companion-rules(.test).ts`다. 겹치는 곳은 `trip-hero.tsx`(T020·T030) 하나라 그 둘만 차례로 한다.
- US4: T031, T033
- US3: T036
- Polish: T041, T042

---

## Parallel Example: User Story 1

```text
# 규칙·부품은 함께:
Task: "T014+T015 inviteExpiryLabel 테스트와 구현 in src/features/trip/invite-storage(.test).ts"
Task: "T017 MemberRow in src/features/trip/components/member-row.tsx"

# 그다음 차례로:
Task: "T016 useInviteLink" → "T018 TripInviteScreen" → "T019 invite.tsx 라우트" → "T020 trip-hero 초대 버튼 (1번 고침)"
```

## Parallel Example: User Story 2

```text
Task: "T021+T023 buildTripUpdate 테스트와 구현"
Task: "T022 use-update-trip 테스트 (T027과 짝)"
# T024 useTripEditDraft는 1번 파일도 고치므로 혼자 한다
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1~2를 끝낸다. 판단 규칙·캐시·초대 저장의 테스트가 통과한다.
2. Phase 3(US1, S18)을 끝낸다.
3. **멈추고 확인한다**: 웹 테스트 모드로 quickstart 1을 본다. 시연 한 바퀴(S17→S18)가 된다.

### Incremental Delivery

1. 기반 → US1(초대): 동행을 부를 수 있다.
2. US2(정보 수정): "나중에 정할게요"로 남긴 기간·여행지를 채울 수 있다. 상세의 '지금 할 일'이 넘어간다.
3. US4(방장 메뉴): 넘기기·내보내기·삭제.
4. US3(나가기): B의 시트를 연결한다.
5. 마무리: 검사, 실서버 확인, 공유, 마지막으로 기기 확인.

---

## 1번 파일·공통 파일 고침 모음

| 작업 | 파일 | 구분 |
| --- | --- | --- |
| T001 | `src/features/trip/types.ts` | 1번 고침 |
| T002 | `src/api/errors.ts` | 1번 고침 |
| T003 | `src/features/trip/api.ts` | 1번 고침 |
| T008 | `src/features/trip/hooks/use-create-trip.ts` | 1번 고침 |
| T013 | `src/api/dev-mock.ts` | 1번 고침 |
| T020 | `src/features/trip/components/trip-hero.tsx` 초대 버튼 | 1번 고침 |
| T024 | `src/features/trip/hooks/use-new-trip-draft.ts` 공통 조각 뽑기 | 1번 고침 |
| T025 | `src/features/trip/screens/region-search-screen.tsx` | 1번 고침 |
| T030 | `src/features/trip/components/trip-hero.tsx` 설정 버튼 | 1번 고침 |
| T011 | `src/stores/session-store.ts` | 공통 고침 |
| T035 | `src/features/trip/components/leave-trip-sheet.tsx`, `src/app/dev/ui.tsx` | 공통 고침(B 컴포넌트) |
| T041 | `docs/design/screens/S50-confirm.md` | 공통 고침(B 문서, 동의 뒤) |

## Notes

- [P]는 다른 파일이고 기대는 작업이 없다는 뜻이다.
- 커밋은 사용자가 요청할 때만 한다. 형식은 `Type : 제목`, 본문 글머리, 끝에 `Resolves: EODI-194`다. 괄호와 AI 표기는 넣지 않는다.
- 새 라우트 파일을 만든 뒤에는 개발 서버를 켜서 `.expo/types/router.d.ts`를 새로 만들어야 `tsc`가 통과한다.
- 화면 문구는 피그마와 spec.md를 따른다. 피그마에 없는 문구는 research.md에 적은 것을 쓴다.

---

## Phase 8: Convergence

- [X] T044 [US2] 내가 한 방장 넘기기·동행 내보내기가 성공하면 S19 수정 기준(`base`)만 새 여행으로 바꾼다. 입력값(이름·기간·여행지)은 그대로 둔다. 그래야 다음 [완료]가 내 변경 때문에 409를 받아 "다른 동행이 먼저 고쳤어요"가 뜨고 고치던 값이 사라지는 일이 없다. 대상 파일은 셋이다. `src/features/trip/hooks/use-trip-edit-draft.ts`에 `rebase(trip)`(입력값은 두고 `base`만 교체, `base?.id`가 같은 여행일 때만)를 더한다. `src/features/trip/hooks/use-member-actions.ts`에서는 넘기기 성공 때 응답 여행으로, 내보내기 성공 때 `refreshTripAfterConflict`로 받은 여행으로 `rebase`를 부른다. `src/features/trip/hooks/use-member-actions.test.tsx`에 "넘기기·내보내기 뒤 저장 본문의 expectedVersion이 새 버전이다"를 더한다 per FR-013, US2/AC6 (partial)
- [X] T045 [US1] 여행이 404 `TRIP_NOT_FOUND`(다른 기기에서 내보내짐·여행 삭제 등)면 이 기기에 남긴 그 여행의 초대 링크를 지운다. `src/features/trip/hooks/use-trip.ts`에서 `notFound`가 true가 되면 `forgetInviteLink(tripId)`를 부르고 `['trips', tripId, 'invite']`를 null로 둔다 (1번 고침). `src/features/trip/hooks/use-trip.test.tsx`를 새로 만들어 404면 지우고 다른 오류면 지우지 않는지 확인한다 per FR-033 (partial)
- [X] T046 [US3] 혼자 남았을 때 나가기 시트 설명을 "{여행 이름}의 기록이 모두 지워져요. 되돌릴 수 없어요"로 바꾼다. 대상은 `src/features/trip/components/leave-trip-sheet.tsx`이고 (공통 고침, B 컴포넌트), `src/features/trip/components/leave-trip-sheet.test.tsx`의 혼자 남음 경우에 이 문구를 확인하는 줄을 더한다. 바꾼 문구는 quickstart.md "팀에 알릴 것"에 B에게 알릴 것으로 적는다 per FR-027, US3/AC5 (partial)
- [X] T047 `src/api/dev-mock.ts`의 `globalThis.__devMock` 등록을 개발 빌드이면서 테스트 모드일 때만 하게 바꾼다(`__DEV__ && env.devMock`). 지금은 `session-store.ts`·`kakao-login.ts`가 이 파일을 불러오기만 해도 실제 빌드에서 등록된다 per plan R15 (unrequested)
