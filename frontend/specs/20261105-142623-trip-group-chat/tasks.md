---
description: '여행 그룹 채팅 구현 작업 목록'
---

# Tasks: 여행 그룹 채팅

**Input**: `specs/20261105-142623-trip-group-chat/`의 plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Branch**: `feat/EODI-208` (Jira EODI-208)

**Tests**: 사용자가 요청했다. 순수 로직과 훅마다 jest 단위 테스트 작업을 바로 옆에 둔다. 화면은 단위 테스트하지 않고, `/dev/chats`와 웹 미리보기, 기기에서 확인한다.

**Organization**: 사용자 요청 순서로 묶었다.

1. S46 대화방 목록(US3)
2. S47 메시지 보기·이전 메시지(US1)
3. 보내기·실패·다시 보내기(US1)
4. 실시간 받기(US2)
5. 재연결·놓친 메시지 채우기(US2)
6. 비참여자 차단(US4)
7. 시스템 메시지 카드(US5)

스토리 번호는 spec.md와 같다. US1과 US2는 사용자 요청에 맞춰 두 단계로 나눴다. 실서버 확인과 기기 확인은 맨 마지막 두 작업이다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일을 고치고, 끝나지 않은 작업에 기대지 않아 함께 할 수 있다.
- **[Story]**: spec.md의 사용자 스토리(US1~US5).
- **(1번 고침)**: 1번 명세(`specs/20261030-092912-trip-create-detail`, 여행 만들기·상세)에서 만든 파일을 고친다.
- **(2번 고침)**: 2번 명세(`specs/20261105-091142-trip-companions`, 동행 초대·관리·나가기)에서 만든 파일을 고친다.
- **(공통 고침)**: 여러 기능이 함께 쓰는 기반 파일을 고친다.
- 경로는 모두 `frontend/` 기준이다.

---

## Phase 1: Setup (공통 준비)

**Purpose**: 타입, 오류 코드, 캐시 키처럼 모든 작업이 쓰는 이름을 먼저 맞춘다.

- [X] T001 [P] `src/features/chat/types.ts`를 새로 만든다.
  - 타입: `ChatRoom`, `Message`, `MessagePage`, `ChatRealtimeEvent`, `SendMessageBody`(`clientMessageId`, `text`), `MessageWindow`, `OutboxItem`.
  - 칸과 null 여부는 data-model.md "서버 타입"·"메시지 창"·"보내는 중인 메시지"를 그대로 따른다. `UserCard`는 `@/api/types`에서 가져온다.
- [X] T002 [P] `src/api/errors.ts`의 `API_ERROR`에 코드 3개를 더한다 (1번 고침).
  - `CHAT_ROOM_NOT_FOUND`, `CLIENT_MESSAGE_ID_REUSED`, `RATE_LIMITED`
  - 이름은 백엔드 `ChatErrorCode`·`CommonErrorCode`와 같다. 한 줄 설명을 단다.
- [X] T003 [P] `src/features/chat/hooks/chat-keys.ts`를 새로 만든다.
  - `CHAT_ROOMS_KEY = ['chat','rooms']`
  - `chatRoomKey(tripId) = ['trips', tripId, 'chat-room']`
  - `chatMessagesKey(tripId) = ['trips', tripId, 'chat-messages']`
  - 위 두 키가 `['trips', tripId]` 아래라 `forgetTrip`이 같이 지운다는 설명을 단다(research R6).

---

## Phase 2: Foundational (모든 스토리가 기대는 기반)

**Purpose**:

- 채팅 API 함수
- 메시지 합치기 순수 함수
- 보내기 규칙
- 방 표
- STOMP 연결 모듈
- 테스트 모드의 가짜 채팅 서버

**⚠️ CRITICAL**: 이 단계가 끝나야 스토리 작업을 시작한다.

### 채팅 API 함수

- [X] T004 `src/features/chat/api.ts`를 새로 만든다. `apiClient`로 함수 4개를 만든다.
  - `getChatRooms(cursor)`: `GET /chat/rooms`, `limit=100`
  - `getTripChatRoom(tripId)`: `GET /trips/{tripId}/chat-room`, `data`를 꺼낸다
  - `getMessages(roomId, { beforeSequence?, limit })`: `GET /chat/rooms/{roomId}/messages`
    - 응답 `{data, page}`를 감싸지 않은 채 그대로 돌려준다.
    - `cursor`는 보내지 않는다.
  - `sendMessage(roomId, body)`: `POST /chat/rooms/{roomId}/messages`, 201의 `data`를 꺼낸다
  - limit 상수: `FIRST_PAGE_LIMIT = 30`, `OLDER_PAGE_LIMIT = 50`, `CATCH_UP_LIMIT = 100`
  - 근거는 contracts/chat-api.md §1~4다.

### 메시지 합치기 (순수 함수)

- [X] T005 [P] `src/features/chat/message-merge.ts`를 새로 만든다.
  - 함수: `emptyWindow`, `mergeMessages`, `findGap`, `nextFillRequest`, `nextCatchUpRequest`, `reconcileOutbox`, `latestOf`
  - 규칙은 data-model.md "계산 함수" 표와 research R7을 그대로 따른다.
  - 원래 창과 배열을 바꾸지 않는다.
- [X] T006 [P] `src/features/chat/message-merge.test.ts`를 새로 만든다. plan.md "단위 테스트로 증명할 것"의 **합치기 규칙**, **빈칸**, **보내는 중 메시지 교체**(`reconcileOutbox` 부분)를 모두 넣는다.
  - 같은 id 두 번 → 하나
  - 같은 sequence에 `deletedAt` → 덮어쓰기
  - 섞인 순서·내림차순 페이지 → 오름차순
  - oldest·newest·hasOlder 갱신
  - 원본 불변
  - 빈칸: newest 10에 12 → `{after:10, before:12}`, 11 → 빈칸 없음, 처음 받기 전 → 빈칸 없음
  - 빠진 250개 → 요청 계획 100·100·50
  - 최신 페이지가 newest에 닿으면 이어 받기 `null`
  - `reconcileOutbox`: 내 `clientMessageId`만 빠지고, 다른 사람의 같은 ID로는 빠지지 않음
  - `latestOf`: 더 작은 sequence로 되돌리지 않음

### 보내기·차단 규칙 (순수 함수)

- [X] T007 [P] `src/features/chat/chat-rules.ts`를 새로 만든다. 이 단계에서는 함수 3개만 만든다. 목록·표시·카드 규칙은 각 스토리에서 같은 파일에 더한다.
  - `validateMessageText(text)`: `'ok' | 'empty' | 'tooLong'`. 코드 포인트 수(`Array.from`)로 센다. 상수 `MESSAGE_MAX_LENGTH = 1000`.
  - `sendFailure(error)`: `'retry' | 'blocked' | 'rejected'`. 분류표는 contracts/chat-api.md §4다.
  - `isBlocked(error)`: 404 `CHAT_ROOM_NOT_FOUND`·`TRIP_NOT_FOUND`
  - 오류 코드는 `@/api/errors`의 `apiErrorCode`·`toApiError`로 읽는다.
- [X] T008 [P] `src/features/chat/chat-rules.test.ts`를 새로 만든다.
  - `validateMessageText`:
    - `"  "`는 `empty`
    - 1,000자는 `ok`, 1,001자는 `tooLong`
    - 이모지 1,000개는 `ok`
    - 줄바꿈만 있으면 `empty`
  - `sendFailure`:
    - 네트워크·시간 초과·500·429는 `retry`
    - 404 `CHAT_ROOM_NOT_FOUND`는 `blocked`
    - 400·409 `CLIENT_MESSAGE_ID_REUSED`는 `rejected`
  - `isBlocked`: `TRIP_NOT_FOUND`는 `true`, 다른 404는 `false`

### 방 표

- [X] T009 [P] `src/features/chat/room-index.ts`를 새로 만든다. 메모리 `Map`으로 함수 4개를 만든다.
  - `rememberRooms(rooms)`, `tripIdOf(roomId)`, `forgetRoom(roomId)`, `clearRoomIndex()`
  - 테스트는 T034(실시간 반영 테스트)에서 함께 확인한다.

### STOMP 연결 모듈 (`src/realtime`)

- [X] T010 [P] `src/realtime/connection-machine.ts`를 새로 만든다.
  - 타입: `ConnectionState`, `ConnectionEvent`
  - 함수: `nextConnection(state, event)`, `reconnectDelay(attempt)`, `showDisconnected(state, now)`
  - 상수: `DISCONNECTED_NOTICE_MS = 3000`
  - 전이표는 research R4와 data-model.md "연결 상태"를 따른다.
- [X] T011 [P] `src/realtime/connection-machine.test.ts`를 새로 만든다. plan.md **재연결 상태 전이** 항목을 모두 넣는다.
  - `connected → dropped → reconnecting(1)`, 다시 `dropped`면 `attempt=2`
  - `reconnecting` 2,999ms면 안내 없음, 3,000ms면 있음
  - `background`면 `paused`·안내 없음
  - `foreground`면 `connecting`
  - `authFailed`면 `stopped`·안내 있음, `foreground`면 다시 `connecting`
  - `signOut`이면 어디서든 `idle`
  - `reconnectDelay(1..7)`은 1·2·4·8·16·30·30초
- [X] T012 [P] `src/realtime/ws-url.ts`를 새로 만든다.
  - `wsUrl(apiBaseUrl)`: `http→ws`, `https→wss`, 끝 `/`를 지우고 `/ws`를 붙인다.
  - 같은 파일 옆 `ws-url.test.ts`에서 `http://localhost:8080` → `ws://localhost:8080/ws`, `https://a.b/` → `wss://a.b/ws`를 확인한다.
- [X] T013 `src/realtime/connection-store.ts`를 새로 만든다.
  - zustand `useConnectionStore`: `state`, `dispatch(event)`. `dispatch`는 `nextConnection`을 쓴다.
  - `useShowDisconnected()`: 1초마다 지금 시각으로 `showDisconnected`를 다시 계산한다. 안내가 필요한 동안만 타이머를 돈다.
- [X] T014 `src/realtime/realtime-client.ts`를 새로 만든다. `@stomp/stompjs`의 `Client`를 감싼다.
  - **연결 설정**:
    - 주소: `brokerURL = wsUrl(env.apiBaseUrl)`
    - RN용 옵션: `forceBinaryWSFrames: true`, `appendMissingNULLonIncoming: true`
    - 하트비트: 들어오기·나가기 모두 10초
    - 라이브러리 자동 다시 연결은 끈다: `reconnectDelay: 0`
  - **연결 헤더**: `beforeConnect`에서 세션 저장소의 access 토큰을 `connectHeaders.Authorization`에 넣는다.
  - **허용 목적지**: `src/realtime/destinations.ts`를 같이 만든다. `ALLOWED_DESTINATIONS = ['/user/queue/chat']`이다. 서버가 허용한 구독만 넣는다는 설명을 단다(contracts/realtime.md "모듈 경계").
  - **구독 등록부**: `subscribe(destination, { onMessage, onResync })`.
    - `ALLOWED_DESTINATIONS`에 없는 목적지면 개발 빌드에서는 오류를 던지고, 실제 빌드에서는 무시하고 로그를 남긴다.
    - 같은 목적지는 STOMP 구독을 하나만 하고 처리 함수를 여러 개 붙인다. 마지막 처리 함수가 풀리면 구독도 푼다.
    - 연결될 때마다 다시 구독한다.
    - 구독을 마칠 때마다(처음 연결 포함) `onResync`를 모두 부른다(research R5).
    - 본문은 `JSON.parse`해 넘긴다. 실패하면 버리고 개발 로그를 남긴다.
  - **`onStompError`**: `message` 헤더 코드를 본다.
    - `UNAUTHENTICATED`면 `refreshAccessToken()`을 부른다. 새 토큰이면 바로 다시 연결하고, `null`이면 `authFailed('auth')`로 멈춘다. 갱신한 뒤 `CONNECTED`를 한 번도 받지 못한 채 다시 `UNAUTHENTICATED`가 와도 멈춘다. `CONNECTED`를 받으면 이 표시를 지운다(research R3).
    - `PROFILE_INCOMPLETE`·`FORBIDDEN`이면 멈춘다. `FORBIDDEN`은 허용 목적지 목록이 서버와 어긋났을 때만 생긴다.
  - **경계**: `src/stores`, `src/api`, `src/config`만 불러온다. `features/*`는 불러오지 않는다.
  - **끊김**: `onWebSocketClose`·하트비트 끊김이면 `dropped`를 알리고 `reconnectDelay` 뒤 다시 시도한다. NetInfo가 끊김이면 기다린다.
  - **바깥 API**: `start`, `stop`, `pause`, `resume`. 상태는 `connection-store`로 보낸다.
  - **TextDecoder 확인**: 개발 빌드에서 `typeof TextDecoder === 'undefined'`면 경고 로그를 남긴다. 확인은 T068(기기)에서 한다.
  - **주입**: STOMP `Client`를 만드는 함수를 인자로 받을 수 있게 해 테스트에서 가짜를 넣는다.
  - 근거는 research R2~R5와 contracts/realtime.md다.
- [X] T015 `src/realtime/realtime-client.test.ts`를 새로 만든다. 가짜 STOMP `Client`를 넣어 plan.md **실시간 클라이언트** 항목을 모두 확인한다.
  - 연결 헤더에 최신 토큰이 들어간다.
  - 다시 연결되면 목적지를 모두 다시 구독하고 `onResync`를 한 번씩 부른다. 처음 연결에도 한 번 부른다.
  - 같은 목적지를 두 번 등록하면 `SUBSCRIBE`는 1번이고 두 처리 함수가 모두 받는다. 하나를 풀어도 남은 쪽은 계속 받는다.
  - `ALLOWED_DESTINATIONS`에 없는 목적지면 오류가 나고 연결은 영향을 받지 않는다.
  - `ERROR UNAUTHENTICATED`면 `refreshAccessToken`을 한 번 부르고 새 토큰으로 다시 연결한다.
  - 갱신이 `null`이면 `stopped`가 된다.
  - 갱신 뒤 `CONNECTED` 없이 또 `UNAUTHENTICATED`면 멈춘다.
  - 갱신 → `CONNECTED` → 한참 뒤 `UNAUTHENTICATED`면 다시 갱신하고 멈추지 않는다.
  - 생명주기 훅: 로그인 상태가 `signedOut`이 되면 연결을 멈춘다(T017).
  - `pause`면 끊고 `paused`, `resume`이면 다시 연결한 뒤 `onResync`를 부른다.
  - `stop` 뒤에는 다시 연결하지 않는다.
- [X] T016 `src/realtime/dev-transport.ts`를 새로 만든다. 테스트 모드(`env.devMock`)용 메모리 전달이다.
  - 소켓 없이 `subscribe` 등록부에 바로 보낸다.
  - 끊김 흉내: `drop()`·`restore()`. `restore`는 `onResync`를 부른다.
  - `realtime-client.ts`는 `env.devMock`이면 이 전달을 쓴다.
- [X] T017 `src/realtime/index.ts`를 새로 만든다.
  - 내보낼 것: `realtime`(앱에 하나), `useConnectionState`, `useShowDisconnected`
  - 파일 맨 위에 경계 규칙을 적는다: `src/realtime`은 `features/*`를 불러오지 않고, 기능은 `subscribe`로 붙는다.
  - 같은 폴더에 `use-realtime-lifecycle.ts`를 만든다.
    - 세션 `status === 'signedIn'`이면 `start`, 아니면 `stop`. 로그아웃 때 연결을 멈추는 곳은 여기 하나다(T019 참고)
    - `AppState` `active`면 `resume`, `background`면 `pause`. `inactive`(iOS 공유 창·권한 창)에는 끊지 않는다(FR-018: 화면이 보이는 동안 유지)
    - NetInfo가 다시 연결되면 `online` 이벤트를 보낸다.
- [X] T018 `src/app/_layout.tsx`에서 `useRealtimeLifecycle()`을 한 번 부른다 (공통 고침). 기존 `setupQueryFocus()` 옆에 둔다.
- [X] T019 `src/stores/session-store.ts`의 `clearSession`에서 정리를 더 한다 (공통 고침).
  - `clearRoomIndex()`
  - 보내는 중 큐 비우기는 큐가 생기는 T040에서 더한다.
  - `realtime.stop()`은 넣지 않는다. 연결 멈춤은 T017 생명주기 훅이 로그인 상태를 보고 한다. `session-store`가 `src/realtime`을 불러오면 순환 import가 된다(research R15).

### 테스트 모드 가짜 채팅 서버

- [X] T020 `src/api/dev-mock.ts`에 채팅 REST 4개를 더한다 (공통 고침). 응답 모양은 contracts/chat-api.md와 같다.
  - **데이터**: 여행마다 방 하나를 둔다. 예시 메시지에는 내 것, 남의 것, 날짜가 바뀌는 메시지, `deletedAt` 메시지, 나간 사람 메시지를 넣는다.
  - **메시지 목록**: `beforeSequence`·`limit`을 지키고, 내림차순으로 준다.
  - **보내기**:
    - 같은 `clientMessageId`·본문이면 처음 메시지를 준다.
    - 다른 본문이면 409 `CLIENT_MESSAGE_ID_REUSED`다.
    - 공백만이거나 1,000자 초과면 400이다.
  - **실시간 이벤트**: 저장하면 `dev-transport`로 보낸다.
  - **`devMockControls.chat`**: `dropConnection`, `restore`, `incoming(tripId, text)`, `skipNext`, `dropResponse`, `seedLongRoom(tripId, count)`
    - 근거는 contracts/realtime.md "테스트 모드"다.
    - `__devMock` 등록 조건(`__DEV__ && env.devMock`)은 그대로 둔다.

**Checkpoint**: `npx jest`에서 `message-merge`·`chat-rules`·`connection-machine`·`ws-url`·`realtime-client` 테스트가 통과한다. `npx tsc --noEmit`이 통과한다.

---

## Phase 3: User Story 3 - 대화방 목록 S46 (Priority: P2)

**Goal**: 채팅 탭에서 참여 중인 여행의 대화방을 최근 메시지 순으로 보고 고른다. 대화방이 없을 때와 연결이 끊겼을 때를 보여 준다.

**Independent Test**: 테스트 모드에서 채팅 탭을 연다. 방 2개 이상이 여행 이름·최근 메시지와 함께 최근 순으로 보이는지 확인한다. 여행 없는 상태와 끊김 상태는 `/dev/chats`에서 본다(quickstart 3-1·3-2·3-4·3-5).

### Tests for User Story 3

- [X] T021 [P] [US3] `src/features/chat/chat-rules.test.ts`에 `sortRooms`·`roomPreview` 경우를 더한다.
  - `sortRooms`:
    - 최근 메시지 순이다.
    - 메시지 없는 방은 뒤에 서버 순서를 지킨다.
  - `roomPreview`:
    - 지운 메시지는 "삭제된 메시지예요"
    - 내 메시지는 "나: …"
    - 남의 메시지는 "닉네임: …"
    - 나간 사람은 "나간 동행: …"
    - 메시지 없음은 "아직 메시지가 없어요"

### Implementation for User Story 3

- [X] T022 [US3] `src/features/chat/chat-rules.ts`에 함수 3개를 더한다.
  - `sortRooms(rooms)`, `roomPreview(room, meId)`
  - `roomTimeLabel(iso, today)`: 오늘이면 "오후 3:05", 아니면 "11.4" 형식이다. 서울 기준이고 `@/lib/seoul-date`·`@/lib/format-date`를 다시 쓴다.
  - 시스템 메시지 미리보기는 지금 "여행 소식이 있어요"로 둔다. T060에서 카드 문구로 바꾼다.
- [X] T023 [US3] `src/features/chat/hooks/use-chat-rooms.ts`를 새로 만든다.
  - `useInfiniteQuery(CHAT_ROOMS_KEY)`로 모든 쪽을 이어 받는다. 방식은 `useMyTrips`와 같다.
  - 받은 방은 `rememberRooms`에 넣는다.
  - `useMyTrips()`를 같이 켜서 `tripId`로 여행 이름을 붙인다. 없으면 "여행 대화방"이다(research R11).
  - 돌려주는 값: 정렬된 줄 목록, 로딩·오류·빈 상태, `refetch`
- [X] T024 [P] [US3] `src/features/chat/components/connection-banner.tsx`를 새로 만든다.
  - 끊김 안내 줄이다. 문구는 "연결이 끊겼어요. 다시 연결하는 중이에요"다.
  - `stopped`일 때는 [다시 시도] 아이콘으로 `realtime.resume()`을 부른다.
  - 표시 여부는 `useShowDisconnected()`로 정한다.
  - 피그마 S46 연결 끊김(`201-32522`)의 값을 읽어 토큰으로 맞춘다.
- [X] T025 [P] [US3] `src/features/chat/components/room-row.tsx`를 새로 만든다.
  - 내용: `AvatarGroup`(동행 얼굴), 여행 이름, 최근 메시지 한 줄, 시각
  - 피그마 S46 기본(`201-24721`)의 간격·글자·색을 토큰으로 맞춘다.
- [X] T026 [US3] `src/features/chat/components/chat-room-list-view.tsx`를 새로 만든다.
  - 표시만 하는 S46이다. 속성은 줄 목록, 상태(`loading`, `error`, `empty`, `ready`), `showDisconnected`, `onOpen`, `onRefresh`, `onCreateTrip`이다.
  - 대화방 없음: `EmptyState`에 [여행 만들기]를 단다. 피그마 `201-24897`을 따른다. [새 대화]는 없다.
  - 당겨서 새로고침을 한다.
- [X] T027 [US3] `src/features/chat/screens/chat-rooms-screen.tsx`를 새로 만든다.
  - `useChatRooms`와 `chat-room-list-view`를 잇는다.
  - 줄을 누르면 `['trips', tripId, 'chat-room']`을 그 방 값으로 미리 채우고 `/trips/[tripId]/chat`으로 간다(contracts/routes.md).
  - 이 시점에는 대상 화면이 없다. 라우트는 T037에서 생긴다.
- [X] T028 [US3] `src/app/(main)/(tabs)/chats.tsx`의 '준비 중' 자리 화면을 `ChatRoomsScreen` 내보내기로 바꾼다 (1번 고침).

`/dev/chats` 미리보기의 S46 세 상태는 T063에서 한 번에 만든다.

**Checkpoint**: 테스트 모드 채팅 탭에서 방 목록이 보인다.

---

## Phase 4: User Story 1 - 메시지 보기·이전 메시지 (Priority: P1) 🎯 MVP

**Goal**: S17 채팅 메뉴나 S46에서 S47을 열어 대화를 보고, 위로 올려 이전 메시지를 불러온다.

**Independent Test**: 테스트 모드에서 S17 → 채팅을 연다. 최근 메시지가 맨 아래에 있는지 본다. 위로 올리면 이전 메시지가 위에 붙고 읽던 자리가 그대로인지 본다. 지운 메시지와 나간 사람 표시도 본다(quickstart 1-1~1-3·1-10).

### Tests for User Story 1 (보기)

- [X] T029 [P] [US1] `src/features/chat/chat-items.test.ts`를 새로 만든다.
  - 날짜 줄은 서울 날짜 경계(UTC 15:00)에 생긴다.
  - 같은 사람·같은 서울 '분'이면 `showSender=false`이다.
  - 지금 동행이 아니면 `senderName`이 "나간 동행"이다.
  - `deletedAt`이면 `deleted: true`이다.
  - `SYSTEM`은 `kind: 'system'`이다.
  - 보내는 중 항목은 서버 메시지 뒤에 `queuedAt` 순으로 온다. 보내는 중 항목이 오늘 첫 줄이면 앞에 날짜 줄이 생긴다.
- [X] T030 [P] [US1] `src/features/chat/hooks/use-messages.test.tsx`를 새로 만든다. 가짜 `getMessages`와 실제 `QueryClient`를 쓴다.
  - 처음 받기는 `limit=30` 한 번이고 창이 오름차순이다.
  - `loadOlder`는 `beforeSequence=oldestSequence`, `limit=50`이다.
  - `hasNext=false`면 `hasOlder=false`가 되고 더 요청하지 않는다.
  - `loadOlder`가 두 번 동시에 불려도 요청은 하나다.
  - `loadOlder`가 실패하면 `olderState`가 `error`이고 창은 그대로다. 다시 부르면 같은 `beforeSequence`로 요청한다.

### Implementation for User Story 1 (보기)

- [X] T031 [US1] `src/features/chat/chat-rules.ts`에 표시 함수 3개를 더한다. 서울 기준이다.
  - `senderLabel(message, participants)`
  - `messageTimeLabel(iso)`: "오후 3:05"
  - `dayDividerLabel(iso)`: "11월 5일 목요일"
  - `chat-rules.test.ts`에 경계 시각 경우를 더한다.
- [X] T032 [US1] `src/features/chat/chat-items.ts`를 새로 만든다.
  - `toChatItems(window, outbox, { meId, participants })` → `ChatItem[]`
  - 규칙은 data-model.md `chat-items.ts`를 따른다.
  - 시스템 메시지는 이 단계에서 `{ kind: 'system', message }`로만 넘긴다. 카드 모양은 US5에서 정한다.
- [X] T033 [US1] `src/features/chat/hooks/use-chat-room.ts`를 새로 만든다.
  - `useQuery(chatRoomKey(tripId), getTripChatRoom)`. 받으면 `rememberRooms([room])`에 넣는다.
  - 대화방 이름: `['trips', tripId]`의 `title`, 없으면 `['trips','mine']`에서 찾는다. 그래도 없으면 "여행 대화방"이다.
- [X] T034 [US1] `src/features/chat/hooks/use-messages.ts`를 새로 만든다.
  - `useQuery(chatMessagesKey(tripId))`: `queryFn`은 첫 페이지를 받아 `mergeMessages(emptyWindow, …, { hasOlder })`를 돌려준다. `staleTime: Infinity`다.
  - `loadOlder()`: 진행 중이면 다시 부르지 않는다. 결과는 `setQueryData` + `mergeMessages`로 넣는다.
  - `olderState: 'idle' | 'loading' | 'error'`를 돌려준다. 실패해도 창은 그대로 두고, 다시 시도는 같은 `beforeSequence`로 한다(FR-010).
  - 이어 받기·빈칸 채우기는 이 파일에 자리만 두고 T051에서 채운다.
- [X] T035 [P] [US1] `src/features/chat/components/message-bubble.tsx`와 `day-divider.tsx`를 새로 만든다.
  - 말풍선: 내 것은 오른쪽, 남의 것은 왼쪽에 얼굴·닉네임을 둔다. 지운 메시지는 "삭제된 메시지예요"를 흐린 글자로 쓴다. 시각을 단다.
  - 줄바꿈·긴 단어가 화면 밖으로 넘치지 않게 한다.
  - 피그마 S47 기본(`201-25069`) 값을 토큰으로 맞춘다.
- [X] T036 [US1] `src/features/chat/components/chat-room-view.tsx`를 새로 만든다.
  - 표시만 하는 S47이다. 위에 `Header`(대화방 이름·뒤로), 가운데에 FlashList를 둔다.
  - FlashList 설정:
    - 뒤집지 않는다.
    - `maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold }}`
    - `onStartReached`로 `onLoadOlder`를 부른다.
    - 목록 머리(`ListHeaderComponent`)에 `olderState`에 따라 불러오는 중 표시나 [다시 시도] 줄을 둔다.
    - `getItemType`은 `ChatItem.kind`와 `mine`이다.
  - 아래 입력 칸 자리는 속성으로 받는다. 보내기는 Phase 5에서 넣는다.
  - 빈 대화방이면 "첫 메시지를 보내 보세요"를 보인다.
  - 처음 받기 중이면 로딩 표시를, 실패면 `ErrorState`와 [다시 시도]를 보인다.
  - 시스템 항목은 가운데 회색 한 줄 문구로 임시 표시한다. 카드는 US5에서 만든다.
  - 근거는 research R9다.
- [X] T037 [US1] S47 화면과 라우트를 만든다.
  - `src/features/chat/screens/chat-room-screen.tsx`를 새로 만든다. `useLocalSearchParams`의 `tripId`로 `useChatRoom`, `useMessages`, `useMe`, `toChatItems`를 이어 `chat-room-view`에 넘긴다.
  - `src/app/(main)/trips/[tripId]/chat.tsx`를 새로 만든다. `ChatRoomScreen` 내보내기만 한다.
  - 새 라우트 뒤에는 개발 서버를 켜 `.expo/types/router.d.ts`를 새로 만든다.
- [X] T038 [US1] `src/features/trip/components/trip-menu-grid.tsx`의 `chat` 항목에 `open`을 단다 (1번 고침).
  - `open: (tripId) => router.push({ pathname: '/trips/[tripId]/chat', params: { tripId } })`

**Checkpoint**: S17 → 채팅, S46 → 방 누르기가 모두 S47을 열고 이전 메시지를 불러온다.

---

## Phase 5: User Story 1 - 보내기·실패·다시 보내기 (Priority: P1)

**Goal**: 보낸 메시지가 "전송 중"으로 바로 보인다. 실패하면 [다시 보내기]·[지우기]가 보이고, 다시 보내도 서버에 두 번 저장되지 않는다.

**Independent Test**: 테스트 모드에서 보내면 "전송 중" 뒤 시각이 붙는지 본다. `dropResponse()` 뒤 보내 실패가 뜨면 [다시 보내기]를 누르고, 메시지가 하나만 남는지 본다(quickstart 1-4~1-9).

### Tests for User Story 1 (보내기)

- [X] T039 [P] [US1] `src/features/chat/hooks/use-send-message.test.tsx`를 새로 만든다. 가짜 API와 실제 `QueryClient`를 쓴다. plan.md **전송 실패·다시 보내기** 항목을 모두 넣는다.
  - 네트워크 실패면 `failed`·`retry`이고, [다시 보내기]는 같은 `clientMessageId`·본문으로 보낸다.
  - 저장은 됐지만 응답이 실패한 경우, 다시 보내 201을 받으면 창에 하나뿐이다.
  - 400·409면 `rejected`이고 다시 보낼 수 없다.
  - 둘을 연달아 보내면 두 번째 요청은 첫 응답 뒤에 나간다.
  - 첫 번째가 실패해도 두 번째는 보낸다.
  - 201이면 보내는 중 항목이 사라지고 창에 서버 메시지가 들어간다.
  - 404 차단 처리는 T054에서 더한다.

### Implementation for User Story 1 (보내기)

- [X] T040 [US1] `src/features/chat/hooks/use-chat-outbox.ts`를 새로 만든다.
  - zustand 보내는 중 큐다. 함수: `enqueue`, `markFailed`, `retry`, `remove`, `clearRoom`, `clearAll`
  - `clientMessageId`는 `expo-crypto`의 `randomUUID`로 만든다.
  - 상태 전이는 data-model.md를 따른다.
  - T019의 `clearSession` 연결을 여기서 마무리한다 (공통 고침, 같은 파일 T019).
- [X] T041 [US1] `src/features/chat/hooks/use-send-message.ts`를 새로 만든다.
  - 방마다 직렬 큐로 보낸다.
  - 성공하면 `mergeMessages`로 창에 넣고 `reconcileOutbox`로 항목을 지운다. `['chat','rooms']`의 `lastMessage`도 `latestOf`로 바꾼다.
  - 실패하면 `sendFailure`로 분류해 `markFailed`를 부른다. `blocked`는 이 단계에서 `retry`처럼 다루고 T055에서 바꾼다.
  - 돌려주는 값: `send(text)`, `retry(id)`, `discard(id)`
- [X] T042 [P] [US1] `src/features/chat/components/composer.tsx`를 새로 만든다.
  - 여러 줄 입력 칸과 보내기 아이콘 버튼으로 만든다.
  - `validateMessageText`가 `ok`가 아니면 버튼을 끈다.
  - `tooLong`이면 "1,000자까지 보낼 수 있어요"를 보이고 입력은 남긴다.
  - 보내면 입력 칸을 비운다.
  - 키보드가 올라와도 입력 칸이 가려지지 않게 한다. 하단 안전 영역을 지킨다.
- [X] T043 [P] [US1] `src/features/chat/components/outbox-bubble.tsx`를 새로 만든다.
  - 전송 중: 내 말풍선 + "전송 중" 표시
  - 실패: 실패 표시와 [다시 보내기](`retry`일 때만)·[지우기]. 글 버튼보다 아이콘을 먼저 쓴다(사용자 선호).
- [X] T044 [US1] `src/features/chat/screens/chat-room-screen.tsx`와 `components/chat-room-view.tsx`에 `Composer`·`OutboxBubble`·`useSendMessage`·`useChatOutbox`를 잇는다.
  - 내가 보내면 맨 아래로 스크롤한다.

**Checkpoint**: 테스트 모드에서 보내기, 실패, 다시 보내기, 지우기가 된다.

---

## Phase 6: User Story 2 - 실시간 받기 (Priority: P1)

**Goal**: 다른 동행의 메시지가 새로고침 없이 S47과 S46에 들어온다. 내 메시지는 한 번만 보인다. 위를 읽는 중이면 "새 메시지" 버튼이 뜬다.

**Independent Test**: 테스트 모드에서 S47을 연 채 `devMockControls.chat.incoming(tripId, '안녕')`을 부른다. 메시지가 바로 나타나는지 본다. S46에서는 그 줄이 맨 위로 오는지 본다(quickstart 2-1~2-3·3-3).

### Tests for User Story 2 (받기)

- [X] T045 [P] [US2] `src/features/chat/realtime-chat.test.ts`를 새로 만든다. 실제 `QueryClient`를 쓴다. plan.md **실시간 채팅 반영** 항목을 넣는다.
  - 표에 없는 방 이벤트는 `['chat','rooms']`를 무효화한다.
  - 열린 방 이벤트는 창에 들어간다.
  - 목록 `lastMessage`가 바뀐다.
  - 더 작은 sequence로는 되돌리지 않는다.
  - 내 `clientMessageId` 이벤트는 보내는 중 항목을 지운다.
  - 낯선 `senderId`는 `chatRoomKey`를 무효화한다.
  - `type`이 다른 본문은 버린다.

### Implementation for User Story 2 (받기)

- [X] T046 [US2] `src/features/chat/realtime-chat.ts`를 새로 만든다.
  - `startChatRealtime(queryClient)`: `realtime.subscribe('/user/queue/chat', { onMessage })`를 한 번 등록하고 해제 함수를 돌려준다.
  - `onMessage` 순서는 contracts/realtime.md "채팅의 사용" 1~6을 따른다.
  - 빈칸 처리(`findGap`)는 T052에서 넣는다. 이 단계에서는 바로 합친다.
- [X] T047 [US2] `src/app/_layout.tsx`에서 로그인한 동안 `startChatRealtime(queryClient)`를 한 번 등록하고, 로그아웃하면 푼다 (공통 고침). `src/realtime` 안에서는 부르지 않는다(모듈 경계). T018과 같은 파일이라 그 뒤에 한다.
- [X] T048 [P] [US2] `src/features/chat/components/new-message-button.tsx`를 새로 만들고 `chat-room-view.tsx`에 잇는다.
  - `onScroll`로 맨 아래와의 거리를 잰다.
  - 멀리 있는 동안 새 서버 메시지가 오면 버튼을 띄운다. 누르면 맨 아래로 가고 버튼을 숨긴다.

**Checkpoint**: 테스트 모드에서 들어오는 메시지가 S47·S46에 바로 반영된다.

---

## Phase 7: User Story 2 - 재연결·놓친 메시지 채우기 (Priority: P1)

**Goal**: 끊겼다 이어지거나 앱에 돌아오면 놓친 메시지를 순서대로 채운다. 실시간 사이 빈칸도 채운다. 끊긴 동안 S46·S47 위에 안내를 띄운다.

**Independent Test**: 테스트 모드에서 끊김 → `incoming` 7번 → 이어짐을 해 본다. 7개가 순서대로 한 번씩 들어오는지 본다. `skipNext()` 뒤 두 개를 보내면 빈칸이 채워지는지 본다. 끊김 안내가 3초 뒤 뜨는지 본다(quickstart 2-4~2-7·3-5).

### Tests for User Story 2 (재연결)

- [X] T049 [P] [US2] `src/features/chat/hooks/use-messages.test.tsx`에 경우를 더한다.
  - `catchUp()`: newest 10, 서버 최신 260이면 요청이 최신 1번과 `beforeSequence` 2번이다. 결과는 11~260이 빠짐없이 오름차순이다.
  - `catchUp()`: 빠진 7개면 요청 1번이다.
  - `fillGap({after:10, before:12})`: 요청 1번에 11이 들어간다.
  - 창이 있는 방을 다시 열면 `stale`이 아니어도 `catchUp`이 한 번 돈다. 최신 페이지에 있는 `deletedAt`이 반영된다.
  - 이어 받는 동안 실시간으로 같은 메시지가 와도 하나만 남는다.
- [X] T050 [P] [US2] `src/features/chat/realtime-chat.test.ts`에 `onResync` 경우를 더한다.
  - `['chat','rooms']`를 무효화한다.
  - 열린 방은 `catchUp`을 부른다.
  - 열리지 않은 방의 창은 `stale: true`이고 요청은 0번이다.
  - 처음 연결 때도 불린다. 연결 전에 열어 둔 방은 이어 받고, 아직 처음 받기가 끝나지 않은 방(`newestSequence` 없음)은 요청하지 않는다.
  - 실시간 빈칸이 있으면 `fillGap`을 부른다.

### Implementation for User Story 2 (재연결)

- [X] T051 [US2] `src/features/chat/hooks/use-messages.ts`에 이어 받기와 빈칸 채우기를 채운다.
  - 함수: `catchUp(tripId)`, `fillGap(tripId, gap)`
  - `nextCatchUpRequest`·`nextFillRequest`로 다음 요청을 정한다. `CATCH_UP_LIMIT = 100`이다.
  - 같은 방의 이어 받기가 진행 중이면 겹쳐 돌리지 않는다.
  - 개발 로그로 요청 수를 남긴다: `[chat] catch-up requests=N`, `[chat] gap-fill requests=N`(측정).
  - 화면이 열릴 때 창이 있으면 항상 `catchUp`을 부른다. 최근 메시지의 지운 표시를 반영하기 위해서다(spec 엣지 케이스).
- [X] T052 [US2] `src/features/chat/realtime-chat.ts`를 고친다.
  - `onMessage`에서 `findGap`이 있으면 이벤트 메시지를 먼저 합친 뒤 `fillGap`을 부른다.
  - `onResync`를 등록한다. 열린 방(화면이 알려 주는 `activeTripId`)은 `catchUp`, 나머지 창은 `stale: true`, 목록은 무효화한다.
- [X] T053 [US2] `ConnectionBanner`를 S47 `chat-room-view.tsx`에도 놓는다. S46은 T026에서 놓았다.
  - 끊긴 동안 보내면 실패로 바뀌는지 확인한다(US1 시나리오 6).

**Checkpoint**: 테스트 모드에서 끊김·복구·빈칸이 중복 없이 채워진다. 끊김 안내가 3초 규칙을 따른다.

---

## Phase 8: User Story 4 - 비참여자 차단 (Priority: P2)

**Goal**: 나간·내보내진·삭제된 여행의 대화방은 차단 화면만 보인다. 보던 중 차단되면 대화를 지운다. 나가기 뒤 S46에서도 빠진다.

**Independent Test**: 테스트 모드에서 그 여행 멤버에서 나를 빼거나 여행을 지운다. 그 뒤 S47에서 보내기·새로고침을 하면 차단 화면으로 바뀌는지 본다. S19에서 나간 뒤 채팅 탭에 그 방이 없는지 본다(quickstart 4-1~4-4).

### Tests for User Story 4

- [X] T054 [P] [US4] 차단 경우를 테스트에 더한다.
  - `src/features/chat/hooks/use-send-message.test.tsx`: 404 `CHAT_ROOM_NOT_FOUND`면 아래가 모두 된다.
    - `['trips', tripId, 'chat-room']`·`['trips', tripId, 'chat-messages']`가 지워진다.
    - `['chat','rooms']`에서 그 방이 빠진다.
    - 보내는 중 큐가 빈다.
    - 화면 상태가 `blocked`다.
  - `src/features/chat/hooks/use-messages.test.tsx`: `getMessages` 404와 `getTripChatRoom` 404 `TRIP_NOT_FOUND`도 같은 결과다.

### Implementation for User Story 4

- [X] T055 [US4] 차단 정리 함수 두 파일을 새로 만든다.
  - `src/features/chat/hooks/chat-forget.ts`: `forgetChatForTrip(queryClient, tripId)`.
    - `['chat','rooms']`에서 그 방을 뺀다.
    - 그 방의 보내는 중 큐를 비운다(`useChatOutbox.clearRoom`).
    - `forgetRoom`을 부른다.
    - `trip-cache.ts`를 import하지 않는다. T057이 이 함수를 부르므로 순환 import를 막기 위해서다.
  - `src/features/chat/hooks/chat-cache.ts`: `blockRoom(queryClient, tripId)`.
    - `forgetTrip`(2번 명세 `trip-cache.ts`)을 부른다.
    - 이어서 `forgetChatForTrip`을 부른다.
  - `use-chat-room.ts`·`use-messages.ts`·`use-send-message.ts`에서 `isBlocked`면 `blockRoom`을 부르고 `blocked` 상태를 돌려준다.
- [X] T056 [US4] `chat-room-view.tsx`에 차단 상태를 더한다.
  - 대화 내용과 입력 칸 없이 "볼 수 없는 대화방이에요"와 [대화방 목록으로]를 보인다.
  - [대화방 목록으로]는 `dismissAll` 뒤 `/chats`로 간다(contracts/routes.md).
  - 피그마 `201-25215` 값을 토큰으로 맞춘다.
- [X] T057 [US4] `src/features/trip/hooks/trip-cache.ts`의 `exitTrip`에서 채팅 정리를 더한다 (2번 고침).
  - T055의 `forgetChatForTrip(queryClient, tripId)`를 부른다. 목록에서 빼기와 보내는 중 큐 비우기를 한다.
  - `chat-cache.ts`는 부르지 않는다(순환 import 방지).
  - `src/features/trip/hooks/trip-cache.test.ts`에 "exitTrip 뒤 `['chat','rooms']`에 그 방이 없다"를 더한다.
- [X] T058 [US4] `src/api/dev-mock.ts`에 차단 흉내를 더한다 (공통 고침).
  - 내가 멤버가 아니거나 삭제된 여행의 채팅 요청은 404 `CHAT_ROOM_NOT_FOUND`·`TRIP_NOT_FOUND`를 준다.
  - 기존 나가기·내보내기 흉내와 이어지게 한다.

**Checkpoint**: 테스트 모드에서 차단·나가기 뒤 대화가 남지 않는다.

---

## Phase 9: User Story 5 - 시스템 메시지 카드 (Priority: P3)

**Goal**: 시스템 메시지를 가운데 카드로 보인다. 투표·코스 카드의 이동 버튼은 이번에는 '준비 중이에요'를 띄운다(Clarifications).

**Independent Test**: 테스트 모드의 시스템 메시지 예시와 `/dev/chats`에서 아래를 확인한다(quickstart 5-1~5-3).

- 투표·코스·일반 카드가 순서대로 보인다.
- 투표·코스 카드 버튼은 '준비 중이에요'를 띄운다.
- 모르는 `target.type`이면 버튼이 없다.

### Tests for User Story 5

- [X] T059 [P] [US5] `src/features/chat/chat-rules.test.ts`에 `systemCard` 경우를 더한다.
  - `POLL`은 투표 카드, [투표 보기]
  - `ITINERARY`는 코스 카드, [코스 보기]
  - 모르는 값·`null`은 일반 카드, 버튼 없음
  - `text`가 있으면 그 문구, 없으면 종류별 기본 문구
  - `roomPreview`의 시스템 미리보기가 카드 문구다

### Implementation for User Story 5

- [X] T060 [US5] 카드 규칙과 이동 표를 만든다.
  - `src/features/chat/chat-rules.ts`에 `systemCard(message)`를 더하고, `roomPreview`의 시스템 미리보기를 카드 문구로 바꾼다.
  - `src/features/chat/system-card-routes.ts`를 새로 만든다. `SYSTEM_CARD_ROUTES: Partial<Record<'poll' | 'course', (target) => void>>`이고 지금은 비어 있다.
  - 투표·코스 명세가 이 표를 채운다는 설명을 단다(research R13).
- [X] T061 [US5] `src/features/chat/components/system-card.tsx`를 새로 만들고 `chat-room-view.tsx`의 임시 시스템 줄을 바꾼다.
  - 카드는 가운데에 아이콘, 문구, 이동 버튼을 둔다.
  - 버튼은 `SYSTEM_CARD_ROUTES[kind]`가 없으면 `toast.show('준비 중이에요')`를 띄운다.
  - 피그마 `201-25281`(모음), `201-11701`(투표), `201-14141`(코스) 값을 토큰으로 맞춘다.
  - 공통 아이콘에 없는 모양은 가까운 것을 쓰고 설명을 단다.
- [X] T062 [US5] `src/api/dev-mock.ts`의 예시 대화에 `SYSTEM` 메시지를 넣는다 (공통 고침).
  - `target`이 `POLL`, `ITINERARY`, 모르는 값, `null`인 것을 하나씩 넣는다.
  - 서버는 아직 이런 값을 주지 않는다는 설명을 단다.

**Checkpoint**: 시스템 카드 세 종류가 보이고 버튼이 '준비 중이에요'를 띄운다.

---

## Phase 10: Polish & 마무리

**Purpose**: 미리보기, 검사, 팀 공유, 실서버 확인, 기기 확인. 실서버와 기기 확인은 맨 마지막 두 작업이다.

- [X] T063 `src/app/dev/chats.tsx`를 새로 만든다. 서버 없이 피그마 상태를 모두 그린다. 방식은 기존 `src/app/dev/expenses.tsx`와 같다.
  - S46: 기본, 대화방 없음, 연결 끊김
  - S47: 기본, 비참여자 차단, 시스템 메시지 모음, 투표 시스템 메시지, 코스 시스템 메시지, 보내는 중·실패
  - 피그마에 없는 상태도 같은 화면의 토큰으로 그린다.
    - S46: 로딩, 처음 불러오기 실패
    - S47: 로딩, 빈 대화방, 처음 불러오기 실패, 이전 메시지 불러오는 중·실패, "새 메시지" 버튼, 1,000자 초과 입력, 다시 보낼 수 없는 실패, 삭제된 메시지·나간 동행
  - 각 상태는 `chat-room-list-view`·`chat-room-view`에 예시 데이터를 속성으로 넘긴다.
  - 링크 표는 `docs/design/screens/README.md`의 S46·S47 줄을 따른다.
- [X] T064 웹 미리보기(`.claude/launch.json`의 `expo-web`)로 `/dev/chats`의 각 상태를 피그마 노드와 나란히 비교한다. 간격·글자·색이 다르면 토큰으로 고친다. 피그마 값은 구현할 때 `get_design_context`로 읽는다.
- [X] T065 `frontend/`에서 검사 4개를 모두 통과시킨다. 실패하면 고친 뒤 다시 돌린다.
  - `npx tsc --noEmit`
  - `npx expo lint`
  - `npx prettier --check src`
  - `npx jest`
- [X] T066 [P] `specs/20261105-142623-trip-group-chat/quickstart.md` 끝에 "팀에 알릴 것" 절을 만든다.
  - 화면 목록 S46 "미확인 수"를 지우자는 것(Clarifications)
  - 시스템 카드 `target.type` 값(`POLL`·`ITINERARY`)과 문구 출처를 서버가 SYSTEM 메시지를 만들 때 정하자는 것
  - `src/realtime`을 투표·코스·알림도 쓰라는 것과 `subscribe` 사용법
  - S47 주소가 `/trips/[tripId]/chat`이라는 것
- [ ] T067 로컬 백엔드(`EodiLog/dev-up.cmd`)와 웹 실서버 모드(`expo-web-live`)로 실서버 확인을 한다.
  - 계정 두 개로 quickstart 1, 2-1~2-5·2-8·2-9, 3, 4를 확인한다.
  - 측정 기록 표에 아래 값을 적는다: "다시 연결 뒤 빈칸 채우기 요청 수"(7·150·250개), "실시간 빈칸 채우기 요청 수", "상대 화면 도착 시간"(웹 기준)
  - 웹은 브라우저 WebSocket이라 RN 옵션과 다르다. 연결 규칙만 확인한다. 테스트 데이터는 로컬 DB에만 남긴다.
- [ ] T068 안드로이드 기기 확인을 한다(마지막). 개발 빌드에서 확인한다.
  - **TextDecoder**: `typeof TextDecoder`를 확인한다. 없으면 실시간 연결이 실패하므로 폴리필 추가 작업을 Convergence로 남긴다.
  - **앱 앞뒤 전환**: quickstart 2-6. 백그라운드 동안 안내가 없고, 돌아오면 이어 받는다.
  - **비행기 모드**: 1-6·1-7·2-4·2-5
  - **토큰 만료 뒤 다시 연결**: 2-8
  - **화면**: 키보드가 올라와도 입력 칸이 보이고 하단 안전 영역을 지킨다.
  - **측정**: 측정 기록 표의 "긴 대화 스크롤"(`seedLongRoom` 1,000개, 성능 모니터 JS·UI 프레임), "'전송 중'이 보이기까지", "끊김 안내 기준", "보내기 → 서버 메시지 교체 깜빡임", "상대 화면 도착 시간"(기기 두 대 또는 기기+웹)
  - 결과를 quickstart.md 측정 기록 표에 적는다.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 바로 시작한다. T001~T003은 함께 할 수 있다.
- **Foundational (Phase 2)**: Setup 뒤에 한다. 모든 스토리를 막는다.
  - 채팅 쪽: T004는 T001에 기대고, T005·T007은 T001·T002에 기댄다.
  - 실시간 쪽: T013은 T010에, T014는 T010·T012·T013에, T016·T017은 T014에, T018·T019는 T017에 기댄다.
  - 가짜 서버: T020은 T001·T016에 기댄다.
- **US3 S46 (Phase 3)**: Foundational 뒤. T027의 이동 대상(T037)이 없어도 목록 자체는 확인할 수 있다.
- **US1 보기 (Phase 4)**: Foundational 뒤. US3과 따로 할 수 있다. 다만 `chat-rules.ts`(T022·T031)는 같은 파일이라 차례로 한다.
- **US1 보내기 (Phase 5)**: Phase 4의 S47 화면(T036·T037)에 기댄다.
- **US2 받기 (Phase 6)**: Phase 4(창)에 기댄다. 보내는 중 항목 지우기는 Phase 5에 기댄다.
- **US2 재연결 (Phase 7)**: Phase 6에 기댄다.
- **US4 차단 (Phase 8)**: Phase 4·5에 기댄다(보기·보내기 훅에 차단을 넣는다).
- **US5 카드 (Phase 9)**: Phase 4에 기댄다. 다른 스토리와 따로 할 수 있다.
- **Polish (Phase 10)**: 원하는 스토리가 끝난 뒤. T067(실서버)과 T068(기기)은 언제나 맨 마지막이다.

### User Story Dependencies

- **US3 (P2)**: 기반만 있으면 된다. 사용자 요청으로 맨 앞에 둔다.
- **US1 (P1)**: 기반만 있으면 된다. MVP다.
- **US2 (P1)**: US1의 메시지 창과 보내는 중 큐 위에 붙는다.
- **US4 (P2)**: US1의 훅에 차단을 넣는다. 나가기 정리는 2번 명세의 `exitTrip`을 고친다.
- **US5 (P3)**: US1의 S47 위에 카드를 붙인다.

### Within Each User Story

- 테스트 작업과 그 대상 함수는 같은 단계에서 함께 끝낸다. 테스트를 먼저 쓰고 실패를 본 뒤 구현해도 된다.
- 순서: 규칙 → 훅 → 부품 → 화면 → 라우트 → 1·2번 화면 연결.

### Parallel Opportunities

- Phase 1: T001, T002, T003
- Phase 2:
  - 채팅 쪽(T005+T006, T007+T008, T009)과 실시간 쪽(T010+T011, T012)은 서로 다른 파일이다. 함께 할 수 있다.
  - T014 이후 실시간 쪽은 차례로 한다.
- US3: T021, T024, T025
- US1 보기: T029, T030, T035
- US1 보내기: T039, T042, T043
- US2: T045, T048 / T049, T050
- US4: T054
- US5: T059
- Polish: T066

---

## Parallel Example: Foundational

```text
# 채팅 순수 함수와 실시간 상태 전이는 함께:
Task: "T005+T006 message-merge(.test).ts"
Task: "T007+T008 chat-rules(.test).ts"
Task: "T010+T011 connection-machine(.test).ts"
Task: "T012 ws-url(.test).ts"

# 그다음 차례로:
Task: "T013 connection-store" → "T014 realtime-client" → "T015 테스트" → "T016 dev-transport" → "T017 index·lifecycle" → "T018 _layout (공통 고침)"
```

## Parallel Example: User Story 1 (보기)

```text
Task: "T029 chat-items 테스트"
Task: "T030 use-messages 테스트"
Task: "T035 message-bubble·day-divider"
# 그다음: T031 → T032 → T033 → T034 → T036 → T037 → T038(1번 고침)
```

---

## Implementation Strategy

### MVP First

1. Phase 1~2를 끝낸다. 합치기·규칙·상태 전이·실시간 클라이언트 테스트가 통과한다.
2. Phase 4~5(US1)를 끝낸다.
3. **멈추고 확인한다**: 테스트 모드에서 S17 → 채팅, 이전 메시지, 보내기·실패·다시 보내기가 된다. 새로고침으로만 받아도 대화는 된다.

### Incremental Delivery (사용자 요청 순서)

1. 기반
2. S46 목록(US3)
3. S47 보기(US1)
4. 보내기(US1)
5. 실시간 받기(US2)
6. 재연결·빈칸(US2)
7. 차단(US4)
8. 시스템 카드(US5)
9. 마무리: 미리보기, 검사, 공유, 실서버 확인, 마지막으로 기기 확인

---

## 1·2번 파일·공통 파일 고침 모음

| 작업             | 파일                                                                                   | 구분      |
| ---------------- | -------------------------------------------------------------------------------------- | --------- |
| T002             | `src/api/errors.ts`                                                                    | 1번 고침  |
| T028             | `src/app/(main)/(tabs)/chats.tsx` 채팅 탭 자리 화면                                    | 1번 고침  |
| T038             | `src/features/trip/components/trip-menu-grid.tsx` S17 채팅 메뉴 연결                   | 1번 고침  |
| T057             | `src/features/trip/hooks/trip-cache.ts`, `trip-cache.test.ts` 나가기 후 채팅 캐시 정리 | 2번 고침  |
| T018, T047       | `src/app/_layout.tsx`                                                                  | 공통 고침 |
| T019, T040       | `src/stores/session-store.ts`                                                          | 공통 고침 |
| T020, T058, T062 | `src/api/dev-mock.ts`                                                                  | 공통 고침 |

## Notes

- [P]는 다른 파일이고 기대는 작업이 없다는 뜻이다.
- 커밋은 사용자가 요청할 때만 한다.
  - 형식은 `Type : 제목`, 본문 글머리, 끝에 `Resolves: EODI-208`다.
  - 괄호와 AI 표기는 넣지 않는다.
- 새 라우트 파일(T037)을 만든 뒤에는 개발 서버를 켜서 `.expo/types/router.d.ts`를 새로 만들어야 `tsc`가 통과한다.
- 화면 문구는 피그마와 spec.md를 따른다. 피그마에 없는 문구는 spec.md·research.md에 적은 것을 쓴다.
- 숫자 목표(0.1초·2초·3초·요청 수)는 잰 값이 아니다. T067·T068에서 잰 값만 기록한다.
