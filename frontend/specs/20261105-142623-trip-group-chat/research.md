# Research: 여행 그룹 채팅

근거는 2026-11-05 기준 백엔드 코드다.

- `EodiLog/.../chat/**`
- `global/websocket/**`
- [API 명세 §9](../../../docs/api-spec.md)
- [프론트 기술 스택](../../../docs/plan/frontend-tech-stack-2026-11-03.md)
- 설치된 `@stomp/stompjs` 7.5, `@shopify/flash-list` 2.3.2

## R1. 실시간 모듈 이름과 위치: `src/realtime/`

- **Decision**: 앱 전체에서 실시간 연결을 하나만 여는 모듈을 `src/realtime/`에 둔다. 기능 폴더(`features/chat`)에는 두지 않는다.
  - `realtime-client.ts`: STOMP 연결 하나, 구독 등록부, 이벤트 나눠 주기
  - `connection-machine.ts`: 연결 상태 전이를 계산하는 순수 함수
  - `connection-store.ts`: 화면이 읽는 연결 상태(zustand)
  - `use-realtime-lifecycle.ts`: 로그인·앱 앞뒤 전환·네트워크 변화에 맞춰 켜고 끄기
- **기능이 쓰는 방법**: 기능은 `realtime.subscribe(destination, onMessage)`로 목적지를 등록한다. 등록부는 다시 연결될 때마다 모든 목적지를 다시 구독한다.
  - 채팅은 `/user/queue/chat` 하나를 등록한다.
  - 투표·코스·알림 신호가 생기면 같은 등록부에 더한다.
  - 다시 연결된 뒤 빠진 것을 채우는 일은 기능이 맡는다. 등록할 때 `onResync` 콜백을 같이 넘긴다.
- **Rationale**: 서버 규칙상 사용자당 큐가 하나이고 연결도 하나면 된다. 투표·코스·알림이 같은 연결을 써야 하므로 기능 밖에 둔다. `src/api/`와 같은 높이의 기반 모듈이다.
- **Alternatives**:
  - 화면마다 연결: 탭을 오갈 때마다 다시 연결되고 이벤트를 놓친다.
  - `features/chat` 안에 두기: 다음 명세에서 옮겨야 한다.

## R2. STOMP 라이브러리 설정

- **Decision**: `@stomp/stompjs`의 `Client`를 쓴다. 이미 설치돼 있어 새 패키지는 없다.
  - **주소**: `env.apiBaseUrl`에서 `http`→`ws`, `https`→`wss`로 바꾸고 `/ws`를 붙인다. `/api/v1` 밖이고 SockJS는 쓰지 않는다.
  - **RN용 옵션**: `forceBinaryWSFrames: true`, `appendMissingNULLonIncoming: true`. 기술 스택 문서의 RN용 설정이다.
  - **하트비트**: `heartbeatIncoming: 10000`, `heartbeatOutgoing: 10000`. 서버 `HEARTBEAT_MILLIS = 10_000`과 맞춘다.
  - **다시 연결**: 라이브러리의 자동 다시 연결은 끈다(`reconnectDelay: 0`). 대기 시간과 토큰 갱신은 R4·R5에서 우리가 정한다.
- **TextDecoder 확인 필요**: stompjs는 프레임을 해석할 때 `TextEncoder`·`TextDecoder`를 쓴다.
  - Expo winter 런타임(`expo/src/winter/runtime.native.ts`)은 `TextDecoderStream`만 설치한다.
  - Hermes에 `TextDecoder`가 기본으로 있는지는 이 저장소에서 확인하지 못했다.
  - 그래서 첫 구현 작업에서 개발 빌드로 `typeof TextDecoder`를 확인한다. 없으면 폴리필을 `npx expo install`로 더하는 작업을 따로 만든다.
  - 웹 미리보기와 jest(Node)에는 둘 다 있다.
- **Rationale**: 팀 기술 스택 결정이다. 수동 다시 연결이라야 토큰 갱신과 앱 앞뒤 전환을 한곳에서 다룬다.
- **Alternatives**:
  - 날 WebSocket에 STOMP를 직접 구현: 하트비트와 프레임 해석을 다시 만들어야 한다.

## R3. 인증과 토큰 만료

- **Decision**:
  - `beforeConnect`에서 세션 저장소의 최신 access 토큰을 `connectHeaders.Authorization = 'Bearer …'`로 넣는다. 주소에는 싣지 않는다.
  - **`ERROR` `UNAUTHENTICATED`를 받으면**: `src/api/session.ts`의 `refreshAccessToken()`을 부른다. 동시에 여러 번 불러도 갱신은 한 번만 일어난다.
    - 새 토큰이 오면 바로 다시 연결한다.
    - `null`이면 연결을 멈춘다. 갱신 실패 시 세션 저장소가 `expired`를 켜므로 다시 로그인 안내가 뜬다.
  - **연속 실패 방지**: 갱신한 뒤 연결 성공(`CONNECTED`)을 한 번도 받지 못한 채 다시 `UNAUTHENTICATED`가 오면 멈춘다. `CONNECTED`를 받으면 이 표시를 지운다. 그래서 오래 연결해 있다가 토큰이 정상 만료된 경우에는 멈추지 않고 다시 갱신한다. 멈춘 뒤에는 다음에 앱이 앞으로 올 때 다시 시도한다.
  - **`PROFILE_INCOMPLETE`·`FORBIDDEN`**: 다시 시도하지 않고 멈춘다. 개발 로그에 코드를 남긴다.
- **Rationale**:
  - 서버는 연결에 쓴 access 토큰의 만료 시각에 `ERROR UNAUTHENTICATED`로 연결을 닫는다(`StompSessionExpiry`).
  - REST와 같은 갱신 함수를 써야 refresh 토큰을 두 번 쓰지 않는다. 두 번 쓰면 서버가 로그인 전체를 끊는다.
- **Alternatives**:
  - 연결 전에 만료 시각을 계산해 미리 갱신: access 토큰 만료 시각을 앱이 따로 알아야 한다. 지금 세션 저장소에는 없다.

## R4. 연결 상태 전이

- **Decision**: 순수 함수 `nextConnection(state, event)`로 계산한다.

  | 상태           | 뜻                                        | 화면                           |
  | -------------- | ----------------------------------------- | ------------------------------ |
  | `idle`         | 로그아웃 또는 아직 시작 전                | 안내 없음                      |
  | `connecting`   | 처음 연결 중                              | 안내 없음                      |
  | `connected`    | 연결됨, 구독 완료                         | 안내 없음                      |
  | `reconnecting` | 끊긴 뒤 다시 연결 중(시도 횟수 `attempt`) | 끊긴 지 3초가 지나면 끊김 안내 |
  | `paused`       | 앱이 백그라운드라 일부러 끊음             | 안내 없음                      |
  | `stopped`      | 인증 실패로 멈춤                          | 끊김 안내                      |

  | 이벤트       | 결과                                                                |
  | ------------ | ------------------------------------------------------------------- |
  | `start`      | 로그인했고 앱이 앞에 있음 → `connecting`                            |
  | `connected`  | `connected`, 시도 횟수 0                                            |
  | `dropped`    | 소켓 닫힘·하트비트 끊김·네트워크 끊김 → `reconnecting`, `attempt+1` |
  | `authFailed` | `stopped`                                                           |
  | `background` | `paused`                                                            |
  | `foreground` | `paused`·`stopped` → `connecting`                                   |
  | `online`     | `reconnecting` → 기다리지 않고 바로 시도                            |
  | `signOut`    | `idle`                                                              |

- **다시 시도 간격**: `attempt`에 따라 1, 2, 4, 8, 16, 30초다. 30초 뒤로는 30초마다 다시 시도한다.
  - 네트워크가 끊겨 있는 동안(NetInfo `isConnected === false`)에는 시도하지 않는다. 돌아오면(`online`) 바로 한 번 시도한다.
- **끊김 안내 기준 3초**(SC-007): 이 값은 정한 값이고 잰 값이 아니다. 기기에서 확인해 quickstart에 기록한다.
  - 안내는 `reconnecting`이 3초 넘게 이어지거나 `stopped`일 때 띄운다.
  - 하트비트가 끊긴 것은 라이브러리가 늦어도 약 20초 안에 알아챈다.
- **Rationale**:
  - 상태 전이를 순수 함수로 두면 "끊김 → 3초 → 안내", "백그라운드 → 끊김 안내 없음" 같은 규칙을 단위 테스트로 증명할 수 있다(사용자 요청).
  - 다시 시도 간격을 늘려 가면 서버가 내려갔을 때 요청이 몰리지 않는다.
- **Alternatives**:
  - 라이브러리의 고정 간격 다시 연결: 토큰 갱신과 백그라운드 처리를 끼워 넣을 자리가 없다.

## R5. 앱 앞뒤 전환과 다시 동기화

- **Decision**:
  - `AppState`가 `background`·`inactive`가 되면 연결을 끊는다(`paused`).
  - `active`가 되면 다시 연결한다. 이어서 구독 등록부의 `onResync`를 모두 부른다.
  - 구독이 끝날 때마다(처음 연결 포함) `onResync`를 부른다. 연결이 끝나기 전에 REST로 받은 메시지 창이 있을 수 있기 때문이다(API 명세의 "연결 → 구독 → REST" 순서). 받은 것이 없으면 기능 쪽에서 할 일이 없다.
  - **채팅의 `onResync`가 하는 일**:
    1. 대화방 목록(`['chat','rooms']`)을 무효화한다.
    2. 지금 화면에 열린 대화방은 바로 이어 받는다(R7).
    3. 캐시에만 있고 열리지 않은 대화방은 `stale` 표시만 한다. 다음에 열 때 이어 받는다.
  - **순서**: 서버 규칙대로 구독을 먼저 한 뒤 REST로 이어 받는다. 이어 받는 동안 실시간으로 들어온 메시지는 합치기 규칙(R7)이 중복 없이 합친다.
- **Rationale**:
  - 푸시가 없으니 백그라운드 연결은 배터리만 쓴다.
  - 열지 않은 방까지 모두 이어 받으면 요청이 방 수만큼 늘어난다. 측정 항목이다.
- **Alternatives**:
  - 백그라운드에서도 유지: OS가 결국 끊고, 끊긴 것을 늦게 안다.

## R6. 캐시 구조

- **Decision**: 서버 데이터는 TanStack Query에 둔다. 채팅 캐시는 가능한 한 `['trips', tripId, …]` 아래에 둔다. 그러면 나가기·삭제의 `forgetTrip`이 별도 작업 없이 같이 지운다.

  | 키                                   | 내용                                                           | 비고                                                           |
  | ------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------- |
  | `['chat','rooms']`                   | 내 대화방 전부(`ChatRoom[]`). 커서를 끝까지 받아 하나로 합친다 | S46. `limit=100`                                               |
  | `['trips', tripId, 'chat-room']`     | 그 여행의 `ChatRoom`                                           | S47 진입. S46에서 들어오면 목록 값으로 미리 채워 요청을 줄인다 |
  | `['trips', tripId, 'chat-messages']` | `MessageWindow`(data-model)                                    | S47. `useInfiniteQuery`를 쓰지 않는다(아래)                    |

- **방 ID와 여행 ID 연결**: 실시간 이벤트에는 `roomId`만 있다. `roomId → tripId` 표를 `ChatRoom`을 받을 때마다 채운다(`room-index.ts`, 메모리).
  - 표에 없는 방의 이벤트가 오면 `['chat','rooms']`를 무효화해 다시 받는다.
- **보내는 중인 메시지는 서버 데이터가 아니다**: zustand `useChatOutbox`에 방별로 둔다. 기기 메모리에만 있다(명세 Assumptions).
- **`useInfiniteQuery`를 쓰지 않는 이유**:
  - 실시간 메시지와 빈칸 채우기를 페이지 묶음에 끼워 넣기 어렵다.
  - `refetch`가 모든 페이지를 처음부터 다시 받는다.
  - 대신 한 줄로 이어진 메시지 배열(`MessageWindow`)을 `setQueryData`와 합치기 순수 함수로만 바꾼다.
  - 처음 받기는 `queryFn`이 한다. 이전 메시지, 빈칸 채우기, 이어 받기는 별도 함수가 한다.
  - `staleTime: Infinity`로 둔다. 다시 받을지는 우리가 정한다(R5·R7).
- **Rationale**: `CONVENTION.md`의 서버 데이터는 TanStack Query 원칙을 지킨다. 나간 여행 정리(이전 명세 R5)를 다시 쓸 수 있다.

## R7. 메시지 합치기 규칙: `features/chat/message-merge.ts` 순수 함수

- **Decision**:
  - `mergeMessages(window, incoming)`:
    - `id`로 중복을 뺀다.
    - 같은 `sequence`가 오면 들어온 것으로 덮어쓴다. 지운 메시지의 `deletedAt` 반영이 그 예다.
    - `sequence` 오름차순으로 정렬한다.
    - `oldestSequence`·`newestSequence`를 다시 계산한다.
    - 원래 배열을 바꾸지 않는다.
  - `findGap(window, event)`:
    - 실시간 메시지의 `sequence > newestSequence + 1`이면 빈칸 `{after: newestSequence, before: sequence}`를 돌려준다.
    - 아직 처음 받기 전(`newestSequence`가 없음)이면 빈칸이 아니다.
  - `fillRequests(after, before, limit)`:
    - 빈칸을 채울 `beforeSequence` 요청 계획을 만든다.
    - `before`부터 시작해 받은 페이지의 가장 작은 `sequence`가 `after + 1` 이하가 되거나 `hasNext=false`면 멈춘다.
    - 실제 요청은 훅이 하고, 이 함수는 다음 요청 하나를 정한다(`nextFillRequest`).
  - **이어 받기(다시 연결·앱 복귀·방 열기)**: S47을 열 때 창이 있으면 `stale`이 아니어도 한 번 한다. 최신 페이지에서 같은 `sequence`를 덮어써 최근 메시지의 `deletedAt`이 반영된다.
    1. 최신 페이지를 `limit=100`으로 받는다.
    2. 그 가장 작은 `sequence`가 `newestSequence + 1`보다 크면, `beforeSequence`로 `newestSequence`에 닿을 때까지 이어 받는다.
    3. 요청 수를 세어 개발 로그에 남긴다(측정).
  - `reconcileOutbox(outbox, messages, myUserId)`:
    - 서버 메시지 중 `senderId === me`이고 `clientMessageId`가 같은 것이 있으면 보내는 중인 메시지를 지운다.
    - 서버 응답, 실시간, 이어 받기 중 무엇으로 먼저 오든 같다.
  - `toChatItems(messages, outbox, ctx)`:
    - 화면 줄 목록을 만든다: 날짜 구분 줄(서울 날짜), 사람 메시지, 시스템 카드, 보내는 중·실패 메시지.
    - 보내는 중인 메시지는 맨 아래에 보낸 순서로 놓는다.
    - 같은 사람이 같은 분에 이어 보내면 얼굴·닉네임을 첫 줄에만 둔다. 이건 화면 기준이라 정한 값이다.
    - 보낸 사람이 지금 동행 목록에 없으면 "나간 동행"으로 표시한다.
- **Rationale**:
  - 사용자 요청: 합치기 규칙을 순수 함수로 분리하고 단위 테스트로 증명한다.
  - 서버가 `sequence`를 방마다 1부터 빈틈없이 매기므로 빈칸을 계산할 수 있다(`MessageResponse.sequence` 설명).

## R8. 보내기와 다시 보내기

- **Decision**: `useSendMessage(roomId)`가 보낸다.
  - **입력 확인** `validateMessageText(text)`:
    - 앞뒤 공백을 지우면 비는 경우 `'empty'`. 보내기 버튼을 끈다.
    - 코드 포인트 수(`Array.from(text).length`)가 1000보다 크면 `'tooLong'`. 버튼을 끄고 안내를 띄운다. 서버도 코드 포인트로 센다.
    - NUL 문자는 지운다.
    - 본문은 입력한 그대로 보낸다. 서버도 받은 그대로 저장한다.
  - **보내기**:
    1. `clientMessageId = randomUUID()`(expo-crypto, 이미 씀)로 `useChatOutbox`에 `{status:'sending'}` 항목을 넣는다.
    2. `POST /chat/rooms/{roomId}/messages`를 보낸다.
    3. 201이면 받은 `Message`를 `mergeMessages`로 넣고 보내는 중 항목을 지운다.
  - **실패 분류** `sendFailure(error)`:

    | 응답                           | 분류       | 처리                                                                |
    | ------------------------------ | ---------- | ------------------------------------------------------------------- |
    | 네트워크·시간 초과·5xx         | `retry`    | 실패 표시, [다시 보내기]·[지우기]                                   |
    | 404 `CHAT_ROOM_NOT_FOUND`      | `blocked`  | 차단 화면(R10)                                                      |
    | 409 `CLIENT_MESSAGE_ID_REUSED` | `rejected` | 실패 표시, [지우기]만. 설계상 생기지 않는다                         |
    | 400                            | `rejected` | 실패 표시, [지우기]만                                               |
    | 401                            | 위와 같음  | axios 인터셉터가 갱신 후 한 번 다시 보낸다. 실패하면 위 표를 따른다 |

  - **다시 보내기**: 같은 `clientMessageId`와 같은 본문으로 보낸다. 서버는 같은 보낸 사람·같은 ID·같은 방·같은 본문이면 처음 응답을 돌려준다. 그래서 두 번 저장되지 않는다(SC-004).
  - **보내는 순서**:
    - 방마다 한 번에 하나씩 차례로 보낸다(직렬 큐). 동시에 보내면 서버 도착 순서가 바뀔 수 있다.
    - 실패한 항목은 큐에서 빠진다. 뒤 항목은 계속 보낸다.
- **Rationale**:
  - 화면에 "전송 중"을 바로 그리려면(SC-001) 요청을 기다리지 않는 로컬 상태가 있어야 한다.
  - 이미 있는 `createIdempotencyKeyStore`는 입력이 바뀌면 키를 바꾸는 방식이다. 채팅은 메시지마다 키가 하나라 그대로 쓰지 않는다.

## R9. 긴 대화 목록: FlashList v2

- **Decision**: `@shopify/flash-list` 2.3.2를 뒤집지 않은 목록(위가 오래된 메시지)으로 쓴다. 이미 설치돼 있다.
  - **아래 기준 렌더**: `maintainVisibleContentPosition: { startRenderingFromBottom: true, autoscrollToBottomThreshold }`. 맨 아래 근처를 보고 있을 때만 새 메시지를 따라 내려간다(FR-019).
  - **이전 메시지**: 위 끝에 닿으면 `onStartReached`로 더 받는다. 위에 붙여도 `maintainVisibleContentPosition`이 읽던 자리를 지킨다(FR-010).
  - **"새 메시지" 버튼**: 맨 아래에서 떨어져 있는 동안 새 메시지가 오면 띄운다. `onScroll`로 거리를 잰다.
  - **`getItemType`**: 날짜 줄, 내 메시지, 남의 메시지, 시스템 카드로 나눠 재사용 효율을 높인다.
- **Rationale**:
  - FlashList v2의 이 속성들은 채팅 화면용이다(설치된 타입 정의의 설명).
  - `inverted`는 안드로이드에서 회전 변환을 써서 스크롤 막대가 왼쪽에 생긴다(같은 파일 설명).
  - 새 구조(New Architecture) 전용 속성이다. 이 앱은 SDK 58이라 새 구조다.
- **측정**: 긴 대화 스크롤 성능(plan "측정할 것").

## R10. 비참여자 차단

- **Decision**: 아래 응답이 오면 그 방을 `blocked`로 바꾼다.
  - `CHAT_ROOM_NOT_FOUND`(404): `/chat/rooms/{roomId}/**`의 조회·보내기
  - `TRIP_NOT_FOUND`(404): `GET /trips/{tripId}/chat-room`

  `blocked`가 되면:
  1. 화면은 차단 상태(S47 비참여자 차단)로 바꾼다.
  2. `forgetTrip`으로 `['trips', tripId, …]`(대화방·메시지 포함)를 지운다.
  3. `['chat','rooms']`에서 그 방을 뺀다.
  4. 보내는 중 큐를 비운다.
  - 차단 화면의 [대화방 목록으로]는 채팅 탭으로 간다.

- **이 기기에서 나가기·삭제를 마치면**: 이전 명세의 `exitTrip`이 `forgetTrip`을 부르므로 메시지 캐시도 같이 지워진다. 여기에 `['chat','rooms']`에서 빼기와 보내는 중 큐 비우기만 더한다(`trip-cache.ts` 고침).
- **Rationale**: 서버는 없는 방, 삭제된 여행, 나간 방을 모두 같은 404로 답한다. 화면도 하나로 다룬다.

## R11. 대화방 이름과 동행 얼굴

- **Decision**:
  - **이름**: 이미 받아 둔 여행 정보에서 가져온다. `['trips', tripId]`(상세)를 먼저 보고, 없으면 `['trips','mine']` 목록에서 `tripId`로 찾는다.
    - S46은 `useMyTrips`를 같이 켠다. 이미 모든 쪽을 받는 훅이라 추가 요청이 대개 없다.
    - 찾지 못하면 "여행 대화방"을 잠깐 보인다. 목록을 받으면 바뀐다.
  - **보낸 사람 닉네임·얼굴**: `ChatRoom.participants`(지금 동행)에서 찾는다.
    - 없으면 "나간 동행"이다.
    - 실시간으로 낯선 `senderId`가 오면 새 동행일 수 있다. `['trips', tripId, 'chat-room']`을 한 번 무효화한다.
- **Rationale**: `ChatRoomResponse`에는 여행 이름이 없다(백엔드 코드). 사용자 요청대로 여행 목록 캐시에서 찾는다.

## R12. 대화방 목록 정렬과 실시간 반영

- **Decision**:
  - **정렬**: `sortRooms(rooms)`
    - `lastMessage.createdAt`이 늦은 방이 먼저다. 같으면 `sequence`를 본다.
    - 메시지가 없는 방은 그 아래에 놓고, 서버가 준 순서(방을 만든 역순)를 따른다.
  - **실시간**: 실시간 메시지가 오면 `['chat','rooms']`의 그 방 `lastMessage`를 더 큰 `sequence`일 때만 바꾼다.
- **Rationale**: 서버는 방을 만든 순서로만 준다(`createdAt DESC`). 한 사람의 방은 참여 여행 수만큼이라 많지 않다.

## R13. 시스템 메시지 카드

- **Decision**: `type === 'SYSTEM'`은 가운데 카드로 그린다. 종류는 `target.type`으로 나눈다.

  | `target.type` | 카드 | 버튼        | 지금 동작                       |
  | ------------- | ---- | ----------- | ------------------------------- |
  | `POLL`        | 투표 | [투표 보기] | '준비 중이에요'(Clarifications) |
  | `ITINERARY`   | 코스 | [코스 보기] | '준비 중이에요'                 |
  | 그 밖·`null`  | 일반 | 없음        | —                               |
  - **문구**: `text`가 있으면 그것을 쓴다. 없으면 종류별 기본 문구("투표 소식이 있어요", "코스가 바뀌었어요", "여행 소식이 있어요")를 쓴다.
  - **연결 방식**: 대상 화면 연결은 `SYSTEM_CARD_ROUTES` 표 하나에 모은다. 투표·코스 명세는 이 표만 고치면 된다.

- **Rationale**:
  - 서버 `Target{type,id}`의 종류 값은 알림 문서의 `POLL`·`ITINERARY`를 따른다(API 명세 §9 알림 target).
  - 서버가 아직 시스템 메시지를 만들지 않아 실제 값은 연동 때 다시 확인한다.

## R14. 서버 없이 상태 보기: `/dev/chats`와 테스트 모드

- **Decision**:
  - **`src/app/dev/chats.tsx`**: S46·S47의 피그마 상태를 예시 데이터로 모두 그린다. 기존 `/dev/expenses` 방식을 따른다.
    - S46 상태: 기본, 대화방 없음, 연결 끊김
    - S47 상태: 기본, 비참여자 차단, 시스템 메시지 모음, 투표 시스템 메시지, 코스 시스템 메시지, 보내는 중·실패
  - **화면 부품은 상태를 속성으로 받는다**: `ChatRoomListView`·`ChatRoomView`처럼 표시만 하는 부품으로 나눈다. 그래야 서버·연결 없이 그대로 그릴 수 있다.
  - **테스트 모드(`env.devMock`)**:
    - `dev-mock.ts`에 채팅 REST 4개를 더한다.
    - 실시간은 `realtime-client`가 소켓 대신 메모리 전달을 쓴다. 가짜 서버가 메시지를 저장하면 같은 이벤트 모양으로 바로 나눠 준다.
    - 연결 끊김 흉내 단추는 `devMockControls`에 둔다.
- **피그마 값**: S46·S47 값 문서는 아직 없다(화면 링크 문서). 구현 때 각 노드를 피그마에서 읽어 맞춘다.
  - S46 노드: `201-24721`, `201-24897`, `201-32522`
  - S47 노드: `201-25069`, `201-25215`, `201-25281`, `201-11701`, `201-14141`

## R15. 로그아웃

- **Decision**: 로그아웃에서 기존 `queryClient.clear()`가 채팅 캐시를 지운다. 세션 저장소 `clearSession`에 다음을 더한다.
  - 보내는 중 큐와 `roomId → tripId` 표 비우기
  - 연결 멈춤은 넣지 않는다. 실시간 생명주기 훅이 로그인 상태가 바뀌는 것을 보고 멈춘다. `realtime-client`가 세션 저장소에서 토큰을 읽으므로, 세션 저장소가 `src/realtime`을 불러오면 순환 import가 된다.
  - 토큰이 만료돼 세션이 지워질 때도 같은 경로를 탄다.
- **Rationale**: 다른 계정으로 로그인했을 때 이전 사용자 큐를 구독하거나 대화가 남지 않게 한다(FR-031).

## R16. 들어오는 길

- **Decision**:
  - **S47 주소**: `/trips/[tripId]/chat`(`src/app/(main)/trips/[tripId]/chat.tsx`)
    - 여행 화면들과 같은 묶음이라 탭 막대가 가려진다.
    - 나가기의 `dismissAll`이 같이 닫는다.
  - **S46**: 기존 채팅 탭 `src/app/(main)/(tabs)/chats.tsx`의 자리 화면을 바꾼다.
  - **S17 연결**: `trip-menu-grid.tsx`의 `chat` 항목에 `open`을 단다. 이전 명세 파일 고침이다.
- **Rationale**: S17에서는 `tripId`만 안다. 여행 기준 주소면 `GET /trips/{tripId}/chat-room` 하나로 방을 찾는다.
