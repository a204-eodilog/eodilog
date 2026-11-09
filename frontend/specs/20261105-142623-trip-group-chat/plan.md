# Implementation Plan: 여행 그룹 채팅

**Branch**: `feat/EODI-208` | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261105-142623-trip-group-chat/spec.md`

## Summary

채팅 탭의 S46 대화방 목록과 S47 대화방을 만든다. S47은 S17의 채팅 메뉴에서도 들어간다. 메시지 조회와 보내기는 REST로 하고, 새 메시지는 STOMP로 받는다.

**실시간 모듈**: `src/realtime/`에 앱 전체에서 하나만 쓰는 STOMP 연결을 만든다. 투표·코스·알림도 나중에 이 모듈을 쓴다.

- 연결 상태 전이는 순수 함수로 두어 단위 테스트한다.
- 토큰 만료(`ERROR UNAUTHENTICATED`)면 기존 `refreshAccessToken()`으로 갱신한 뒤 다시 연결한다.
- 앱이 백그라운드로 가면 끊고, 돌아오면 다시 연결한 뒤 빠진 메시지를 REST로 채운다.

**메시지 캐시**: 페이지 묶음이 아니라 한 줄로 이어진 `MessageWindow`로 둔다.

- 처음 받기, 이전 메시지, 실시간, 빈칸 채우기, 이어 받기, 보내기 성공이 모두 같은 합치기 순수 함수(`message-merge.ts`)를 거친다. 그래서 중복과 순서 문제를 한곳에서 막는다.
- 보내는 중인 메시지는 zustand 큐에 둔다. 다시 보낼 때 같은 `clientMessageId`를 써서 서버에 두 번 저장되지 않게 한다.

**나가기 정리**: 캐시를 `['trips', tripId, …]` 아래에 두어, 이전 명세의 `forgetTrip`이 대화 캐시도 같이 지운다.

**미리보기**: `/dev/chats`에서 서버 없이 피그마 상태를 모두 본다.

## Technical Context

**Language/Version**: TypeScript 6, React 19.3, React Native 0.88. Expo SDK 58이고 새 구조, React Compiler, expo-router `typedRoutes`가 켜져 있다. 이전 명세와 같다.

**Primary Dependencies**: 모두 이미 설치돼 있다. 새 패키지는 없다. 단, TextDecoder 확인 결과에 따라 폴리필이 하나 늘 수 있다(research R2).

- **`@stomp/stompjs` ^7.5.0**: 실시간 받기(R2)
- **`@shopify/flash-list` 2.3.2**: 대화 목록. `maintainVisibleContentPosition`, `onStartReached`(R9)
- **`@tanstack/react-query`**: 대화방·메시지 캐시(R6)
- **`zustand`**: 보내는 중 큐 `useChatOutbox`, 연결 상태 저장소
- **`expo-crypto`** `randomUUID`: `clientMessageId`
- **`@react-native-community/netinfo`**, RN `AppState`: 끊김·앞뒤 전환(R4·R5)
- **공통 부품** `components/ui`: `Header`, `Avatar`·`AvatarGroup`, `Icon`, `EmptyState`·`ErrorState`, `toast`, `Button`
- **이전 명세에서 만든 것을 그대로 쓴다**:
  - `src/api`: `apiClient`(401 갱신), `session.ts`의 `refreshAccessToken`, `errors.ts`의 `apiErrorCode`류
  - `src/lib/seoul-date.ts`, `useMe`
  - `features/trip`: `useMyTrips`·`MY_TRIPS_KEY`, `tripKey`, `trip-cache.ts`(`forgetTrip`·`exitTrip`)

**Storage**:

- 서버 데이터는 TanStack Query 메모리 캐시에 둔다.
- 보내는 중 큐와 `roomId → tripId` 표는 메모리에만 둔다.
- 기기에 새로 남기는 것은 없다.

**Testing**: jest-expo + @testing-library/react-native.

- 순수 함수: `message-merge`, `chat-items`, `chat-rules`, `connection-machine`
- 보내기 훅: 가짜 API와 실제 `QueryClient`
- `realtime-client`: 가짜 STOMP `Client`를 넣어 다시 연결·토큰 갱신 흐름

**Target Platform**: Android 개발 빌드. 웹 미리보기(테스트 모드·실서버)로 흐름을 먼저 본다.

**Project Type**: mobile-app (`frontend/`)

**Performance Goals**: 아래 값은 목표값이고 quickstart 측정 기록 표에 결과를 남긴다.

- "전송 중" 표시는 누르자마자 보인다. 목표 0.1초 안(SC-001).
- 상대 화면 도착은 목표 2초 안(SC-002).
- 다시 연결 뒤 이어 받기 요청은 최신 1번과 `ceil((빠진 수 − 100) / 100)`번 이하다.
- 메시지 1,000개 방을 스크롤해도 눈에 띄는 끊김이 없다.

**Constraints**:

- **REST 계약은 백엔드 코드를 따른다**([contracts/chat-api.md](./contracts/chat-api.md)).
  - 메시지 페이지는 `beforeSequence`·`limit`(최대 100)을 쓰고 `cursor`를 섞지 않는다.
  - 응답은 `DataResponse`로 감싸지 않은 `{data, page}`다.
  - 보내기 본문은 `{clientMessageId, text}` 두 칸뿐이다.
  - 공백만 있는 본문과 1,000 코드 포인트를 넘는 본문은 보내기 전에 막는다.
- **실시간 계약**([contracts/realtime.md](./contracts/realtime.md)):
  - 받기만 한다(`SEND` 금지).
  - 구독은 `/user/queue/chat` 하나다.
  - 하트비트는 10초다.
  - 최선 노력이므로 REST 이어 받기가 기준이다.
- 날짜·시각 표시는 서울 기준이다.
- 대화방 이름은 여행 캐시에서 찾는다(`ChatRoom`에 여행 이름이 없다).
- 서버는 아직 SYSTEM 메시지를 만들지 않는다. 시스템 카드 버튼은 이번에 '준비 중이에요'다(Clarifications).

**Scale/Scope**:

- 화면: S46, S47, `/dev/chats`
- 실시간 모듈: 1개
- 대화방: 참여 여행 수만큼이다. 한 방의 동행은 최대 20명이다.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

`.specify/memory/constitution.md`는 아직 빈 양식이다. 이전 명세들과 같은 관문을 쓴다.

| 관문                                                                                    | 근거                                   | 결과                                                                                            |
| --------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 기능 코드는 `features/chat/...`, 라우트 파일은 화면을 내보내기만 한다                   | `frontend/CONVENTION.md`               | 통과                                                                                            |
| 여러 기능이 쓰는 기반은 `src/` 바로 아래에 둔다(`src/api`와 같은 높이)                  | `CONVENTION.md` 폴더 구조, 사용자 입력 | 통과. `src/realtime/`                                                                           |
| `src/realtime`은 `features/*`를 불러오지 않는다. 기능은 `subscribe`로 붙는다            | 투표·코스·알림이 같은 모듈을 다시 쓴다 | 통과. 채팅 구독은 `_layout.tsx`에서 등록한다(contracts/realtime.md "모듈 경계")                 |
| 색·글자·간격은 `src/theme` 토큰과 StyleSheet를 쓰고, 공통 부품과 `icon.tsx`를 다시 쓴다 | `CONVENTION.md`, 사용자 입력           | 통과. 끊김 안내 줄은 `features/chat`에 두고, 투표에서도 쓰게 되면 그때 `components/ui`로 옮긴다 |
| 서버 데이터는 TanStack Query, zustand에는 앱 상태만 둔다                                | `CONVENTION.md`                        | 통과. 보내는 중 큐와 연결 상태만 zustand다(R6)                                                  |
| 새 패키지는 `npx expo install`로만 더한다                                               | `frontend/AGENTS.md`                   | 해당 없음. TextDecoder가 없을 때만 해당한다(R2)                                                 |
| 끝내기 전 lint·typecheck를 통과한다                                                     | `frontend/AGENTS.md`                   | 구현 단계에서 확인한다                                                                          |
| 다른 사람의 파일을 고치면 알린다                                                        | 팀 분담                                | 해당 없음. 고치는 파일은 모두 C 담당(trip)이거나 공용 기반(`dev-mock`, `session-store`)이다     |

설계 후 재확인: 통과. 위반은 없다.

화면 목록과 다르게 하는 점은 하나다. S46의 "미확인 수"는 넣지 않는다(Clarifications). 화면 목록 문서 수정은 팀에 알린다.

## Project Structure

### Documentation (this feature)

```text
specs/20261105-142623-trip-group-chat/
├── spec.md
├── plan.md                  # 이 문서
├── research.md              # 결정과 근거 R1~R16
├── data-model.md            # 타입, MessageWindow, 보내는 중 큐, 연결 상태, 계산 함수, 캐시 키
├── quickstart.md            # 확인 시나리오와 측정 기록 표
├── contracts/
│   ├── chat-api.md          # 채팅 REST 4개 (백엔드 코드 기준)
│   ├── realtime.md          # STOMP 규칙과 src/realtime 모듈 API
│   └── routes.md            # 주소와 이동 규칙
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks 출력
```

### Source Code (`frontend/`)

```text
src/
├── realtime/                          # 새로: 앱 전체 실시간 연결(R1)
│   ├── index.ts                       # realtime, useConnectionState, useShowDisconnected
│   ├── connection-machine.ts          # nextConnection, reconnectDelay, showDisconnected
│   ├── connection-machine.test.ts
│   ├── connection-store.ts            # zustand 연결 상태
│   ├── realtime-client.ts             # STOMP Client 감싸기, 구독 등록부, 토큰 갱신·다시 연결
│   ├── realtime-client.test.ts        # 가짜 Client로 다시 연결·UNAUTHENTICATED·onResync
│   ├── ws-url.ts                      # apiBaseUrl → ws(s)://…/ws
│   ├── destinations.ts                # ALLOWED_DESTINATIONS. 서버가 허용한 구독 목적지
│   ├── dev-transport.ts               # 테스트 모드 메모리 전달
│   └── use-realtime-lifecycle.ts      # 로그인·AppState·NetInfo에 맞춰 start/pause/resume/stop
├── api/
│   ├── errors.ts                      # 고침: CHAT_ROOM_NOT_FOUND, CLIENT_MESSAGE_ID_REUSED, RATE_LIMITED
│   └── dev-mock.ts                    # 고침: 채팅 REST 4개, devMockControls.chat(R14)
├── stores/session-store.ts            # 고침: clearSession에서 보내는 중 큐·방 표 비우기(연결 멈춤은 생명주기 훅)
├── app/
│   ├── _layout.tsx                    # 고침: useRealtimeLifecycle 한 번 부르기
│   ├── (main)/(tabs)/chats.tsx        # 고침: S46 화면 내보내기
│   ├── (main)/trips/[tripId]/chat.tsx # 새로: S47
│   └── dev/chats.tsx                  # 새로: S46·S47 모든 상태 미리보기
└── features/
    ├── chat/                          # 새로
    │   ├── api.ts                     # getChatRooms, getTripChatRoom, getMessages, sendMessage
    │   ├── types.ts
    │   ├── message-merge.ts           # 합치기 규칙(R7)
    │   ├── message-merge.test.ts
    │   ├── chat-rules.ts              # validateMessageText, sendFailure, sortRooms, roomPreview, systemCard, 표시 문구
    │   ├── chat-rules.test.ts
    │   ├── chat-items.ts              # toChatItems
    │   ├── chat-items.test.ts
    │   ├── room-index.ts              # roomId → tripId 표
    │   ├── realtime-chat.ts           # /user/queue/chat 구독, onMessage·onResync(contracts/realtime.md)
    │   ├── realtime-chat.test.ts
    │   ├── system-card-routes.ts      # SYSTEM_CARD_ROUTES. 지금은 비어 있음(R13)
    │   ├── hooks/
    │   │   ├── chat-keys.ts           # CHAT_ROOMS_KEY, chatRoomKey(tripId), chatMessagesKey(tripId)
    │   │   ├── use-chat-rooms.ts      # S46: 모든 쪽 받기 + 정렬 + 여행 이름
    │   │   ├── use-chat-room.ts       # S47: 방 찾기(목록 값 미리 채움)
    │   │   ├── use-messages.ts        # MessageWindow: 처음 받기, 이전 메시지, 이어 받기, 빈칸 채우기
    │   │   ├── use-messages.test.tsx
    │   │   ├── use-chat-outbox.ts     # zustand 보내는 중 큐
    │   │   ├── use-send-message.ts    # 직렬 보내기, 실패 분류, 다시 보내기
    │   │   ├── use-send-message.test.tsx
    │   │   └── chat-cache.ts          # dropRoom, blockRoom(차단 정리)
    │   ├── components/
    │   │   ├── room-row.tsx           # S46 한 줄
    │   │   ├── chat-room-list-view.tsx # S46 표시 전용(상태를 속성으로)
    │   │   ├── message-bubble.tsx     # 내 것·남의 것·지운 메시지
    │   │   ├── outbox-bubble.tsx      # 전송 중·실패 + [다시 보내기]·[지우기]
    │   │   ├── system-card.tsx        # 투표·코스·일반 카드
    │   │   ├── day-divider.tsx
    │   │   ├── composer.tsx           # 입력 칸, 글자 수 확인, 보내기 버튼
    │   │   ├── connection-banner.tsx  # 끊김 안내 줄
    │   │   ├── new-message-button.tsx
    │   │   └── chat-room-view.tsx     # S47 표시 전용(FlashList, 차단 상태 포함)
    │   └── screens/
    │       ├── chat-rooms-screen.tsx  # S46: 훅 연결
    │       └── chat-room-screen.tsx   # S47: 훅 연결
    └── trip/
        ├── components/trip-menu-grid.tsx # 고침(1번 명세): chat 항목 open 연결
        └── hooks/trip-cache.ts           # 고침(1·2번 명세): exitTrip에서 대화방 목록 빼기·보내는 중 큐 비우기
```

**Structure Decision**:

- 채팅은 새 기능 폴더 `features/chat`에 둔다.
- 실시간 연결은 여러 기능이 쓸 기반이라 `src/realtime`에 둔다.
- S47 주소는 여행 아래(`/trips/[tripId]/chat`)에 둔다. 그래서 S17에서 바로 들어가고, 나가기의 `dismissAll`과 `forgetTrip`이 그대로 맞는다.

## 측정할 것

quickstart의 측정 기록 표에 값을 남긴다.

- **다시 연결 뒤 빈칸 채우기 요청 수**:
  - 끊긴 동안 다른 동행이 7개, 150개, 250개를 보낸 뒤 다시 연결한다.
  - 개발 로그 `[chat] catch-up requests=N`으로 요청 수를 센다.
  - 목표는 최신 1번과 `ceil((빠진 수 − 100) / 100)`번 이하다. 7개면 1번, 250개면 3번이다.
  - 열지 않은 방에는 요청이 0번이어야 한다(stale 표시만).
- **실시간 빈칸 채우기 요청 수**: 실시간 하나를 빠뜨린 뒤 다음 메시지가 왔을 때 1번이어야 한다(`[chat] gap-fill requests=N`).
- **긴 대화 스크롤 성능(FlashList)**:
  - 테스트 모드에서 1,000개 방을 만든다(`seedLongRoom`).
  - 기기 개발 빌드에서 위아래로 빠르게 스크롤하며 성능 모니터의 JS·UI 프레임과 빈 칸 깜빡임을 기록한다.
  - 이전 메시지를 붙일 때 읽던 줄이 움직이는지도 본다.
- **상대 화면 도착 시간**과 **"전송 중" 표시 시간**: 목표값(SC-001·002)과 비교해 기록한다.
- **끊김 안내 기준 3초**: 정한 값이다. 끊은 시각과 안내가 뜬 시각을 기록하고, 맞지 않으면 plan을 고친다(SC-007).

## 단위 테스트로 증명할 것

- **합치기 규칙** (`message-merge`):
  - 같은 `id`가 두 번 오면 하나만 남는다.
  - 같은 `sequence`에 `deletedAt`이 생긴 메시지가 오면 덮어쓴다.
  - 섞인 순서로 와도 오름차순이다.
  - 내림차순 페이지를 합쳐도 오름차순이다.
  - `oldestSequence`·`newestSequence`·`hasOlder`가 맞게 바뀐다.
  - 원래 창은 바뀌지 않는다.
- **빈칸** (`findGap`, `nextFillRequest`, `nextCatchUpRequest`):
  - newest 10에 12가 오면 빈칸 `{after:10, before:12}`, 11이 오면 빈칸 없음이다.
  - 처음 받기 전에는 빈칸이 없다.
  - 빠진 250개는 요청 계획이 `beforeSequence` 순서대로 100·100·50이다.
  - 최신 페이지가 기억하던 newest에 닿으면 더 요청하지 않는다.
- **보내는 중 메시지 교체** (`reconcileOutbox`, `toChatItems`):
  - 서버 응답이 먼저 오든 실시간이 먼저 오든 내 `clientMessageId` 항목이 빠진다.
  - 다른 사람의 같은 `clientMessageId`로는 빠지지 않는다.
  - 보내는 중 항목은 맨 아래에 보낸 순서로 놓인다.
  - 날짜 구분 줄은 서울 날짜 경계(UTC 15:00)에 생긴다.
  - 지금 동행이 아닌 사람은 "나간 동행"이다.
  - 같은 사람·같은 분이면 이름을 첫 줄에만 둔다.
- **재연결 상태 전이** (`connection-machine`):
  - `connected → dropped → reconnecting(1)`, 다시 `dropped`면 `attempt`가 2가 된다.
  - `reconnecting`이 3초 미만이면 안내가 없고 3초 이상이면 있다.
  - `background`면 `paused`이고 안내가 없다. `foreground`면 `connecting`이다.
  - `authFailed`면 `stopped`이고 안내가 있다. `foreground`에 다시 시도한다.
  - `signOut`이면 어디서든 `idle`이다.
  - `reconnectDelay`는 1·2·4·8·16·30·30초다.
- **실시간 클라이언트** (`realtime-client`, 가짜 STOMP Client):
  - 연결 헤더에 최신 access 토큰이 들어간다.
  - 다시 연결되면 등록된 목적지를 모두 다시 구독하고 `onResync`를 부른다. 처음 연결에도 부른다.
  - 같은 목적지를 두 번 등록하면 `SUBSCRIBE`는 1번이고 두 처리 함수가 모두 받는다.
  - `ALLOWED_DESTINATIONS`에 없는 목적지는 오류가 나고 연결은 영향을 받지 않는다.
  - `ERROR UNAUTHENTICATED`면 `refreshAccessToken`을 한 번 부르고 새 토큰으로 다시 연결한다.
  - 갱신이 `null`이면 `stopped`가 된다.
  - 갱신 뒤 `CONNECTED` 없이 또 `UNAUTHENTICATED`면 멈춘다. `CONNECTED`를 받은 뒤 한참 지나 오면 다시 갱신한다.
- **전송 실패·다시 보내기** (`use-send-message`, 가짜 API + `QueryClient`):
  - 네트워크 실패면 `failed`·`retry`이고, [다시 보내기]가 같은 `clientMessageId`와 본문으로 다시 보낸다.
  - 서버가 저장했지만 응답이 실패한 경우, 다시 보내 201을 받으면 창에 메시지가 하나뿐이다.
  - 404 `CHAT_ROOM_NOT_FOUND`면 차단 정리가 된다(`['trips', tripId]` 아래 캐시 삭제, 목록에서 빼기, 큐 비우기).
  - 400·409면 `rejected`이고 [다시 보내기]가 없다.
  - 두 개를 연달아 보내면 요청이 차례로 나간다(두 번째는 첫 번째 응답 뒤).
  - 첫 번째가 실패해도 두 번째는 보낸다.
- **입력 확인** (`validateMessageText`): `"  "`면 `empty`, 1,000자면 `ok`, 1,001자면 `tooLong`. 이모지 1,000개면 `ok`(코드 포인트 수).
- **목록** (`sortRooms`, `roomPreview`):
  - 최근 메시지 순이고, 메시지 없는 방은 뒤에 서버 순서를 지킨다.
  - 지운 메시지는 "삭제된 메시지예요", 내 메시지는 "나: …"다.
- **실시간 채팅 반영** (`realtime-chat`):
  - 표에 없는 방 이벤트는 목록을 무효화한다.
  - 열린 방 이벤트는 창에 들어가고 목록 `lastMessage`가 바뀐다.
  - 더 작은 `sequence`로는 목록 `lastMessage`를 되돌리지 않는다.

## Complexity Tracking

위반 없음.
