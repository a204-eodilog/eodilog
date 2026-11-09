# Contract: 실시간 전달과 `src/realtime` 모듈

## 서버 규칙

근거는 [API 명세 §9](../../../../docs/api-spec.md)의 "채팅 실시간 전달"과 백엔드 `global/websocket/*`다.

| 항목           | 값                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| 주소           | `ws(s)://<서버>/ws`. `/api/v1` 밖이고 SockJS는 쓰지 않는다. 핸드셰이크는 인증 없이 열린다                           |
| 인증           | `CONNECT` 헤더 `Authorization: Bearer <access>`. 주소에 토큰을 싣지 않는다                                          |
| 구독           | `/user/queue/chat` 하나. 다른 목적지 구독과 `SEND`는 `ERROR FORBIDDEN`                                              |
| 하트비트       | `10000,10000`                                                                                                       |
| 이벤트 본문    | `{"type":"MESSAGE_CREATED","roomId":"…","message":Message}`. 내가 보낸 것도 온다                                    |
| 오류           | `ERROR` 프레임. `message` 헤더에 코드, 본문은 `{"error":{code,message,fields,traceId}}`. 그 뒤 서버가 연결을 닫는다 |
| 토큰 만료      | 연결에 쓴 access 토큰의 만료 시각에 `ERROR UNAUTHENTICATED`로 닫는다                                                |
| 보장           | 최선 노력이다. REST가 기준이다. 나간 사람·내보낸 사람·삭제된 여행에는 보내지 않는다                                 |
| 보내지 않는 것 | 지운 본문 반영, 참여자 변경, 입력 중, 읽음                                                                          |

## 모듈 API

`src/realtime/index.ts`에서 내보낸다.

```ts
/** 앱 전체에서 하나. 로그인·앱 상태에 맞춰 use-realtime-lifecycle이 켜고 끈다 */
export const realtime: {
  start(): void; // 로그인 상태이고 앱이 앞에 있을 때
  stop(): void; // 로그아웃
  pause(): void; // 백그라운드
  resume(): void; // 앞으로 옴 → 연결 후 onResync 호출
  /**
   * 목적지 하나를 구독한다. 다시 연결될 때마다 다시 구독한다.
   * onResync는 구독이 끝날 때마다(처음 연결 포함) 불린다. 빠진 것을 REST로 채우는 데 쓴다.
   * 같은 목적지를 여러 번 subscribe해도 STOMP 구독은 하나이고 처리 함수가 모두 불린다.
   * 처리 함수끼리는 이벤트 type으로 나눠 받는다. 마지막 처리 함수가 등록을 풀면 구독도 푼다.
   * ALLOWED_DESTINATIONS에 없는 목적지는 개발 빌드에서 오류, 실제 빌드에서 무시하고 로그를 남긴다.
   * 돌려준 함수를 부르면 등록을 지운다.
   */
  subscribe(
    destination: string,
    handlers: { onMessage(body: unknown): void; onResync?(): void },
  ): () => void;
};

/** 화면이 읽는 연결 상태(zustand) */
export function useConnectionState(): ConnectionState;
/** S46·S47 위 안내를 보일지. 3초 규칙(data-model showDisconnected) */
export function useShowDisconnected(): boolean;
```

## 모듈 경계

- `src/realtime`은 `src/stores`, `src/api`, `src/config`만 불러온다. `features/*`는 불러오지 않는다. 기능은 앱 층(`src/app/_layout.tsx`)이나 기능 코드에서 `subscribe`로 붙는다.
- 구독할 수 있는 목적지는 `src/realtime/destinations.ts`의 `ALLOWED_DESTINATIONS` 목록이다. 지금은 `['/user/queue/chat']`이다.
- 서버는 허용하지 않은 구독에 `ERROR FORBIDDEN`을 보내고 연결 전체를 닫는다. 그래서 목록에 목적지를 더하는 일은 서버 허용과 함께 한다.

## 채팅의 사용

`features/chat/realtime-chat.ts`가 사용한다.

1. 로그인 뒤 한 번 `realtime.subscribe('/user/queue/chat', { onMessage, onResync })`를 부른다.
2. **`onMessage`**:
   1. 본문 모양을 확인한다. `type`이 `MESSAGE_CREATED`가 아니면 버린다.
   2. `tripIdOf(roomId)`로 캐시 키를 찾는다. 없으면 `['chat','rooms']`를 무효화하고 끝낸다.
   3. `['trips', tripId, 'chat-messages']`가 있으면 아래를 한다.
      - `findGap`이 있으면 빈칸 채우기를 시작한다.
      - 없으면 `mergeMessages`로 넣는다.
   4. `useChatOutbox`의 `reconcileOutbox`로 내 보내는 중 메시지를 지운다.
   5. `['chat','rooms']`의 그 방 `lastMessage`를 `latestOf`로 바꾼다.
   6. 보낸 사람이 `participants`에 없으면 `['trips', tripId, 'chat-room']`을 무효화한다.
3. **`onResync`**:
   1. `['chat','rooms']`를 무효화한다.
   2. 열린 방은 바로 이어 받는다.
   3. 나머지 메시지 창은 `stale: true`로 둔다.

## 테스트 모드(`env.devMock`)

소켓을 열지 않는다. `realtime`은 메모리 전달로 바뀐다.

- 가짜 서버가 메시지를 저장하면 같은 이벤트 모양을 같은 `onMessage`로 보낸다.
- `devMockControls.chat`에 아래 기능을 둔다.
  - `dropConnection()`: 끊김 흉내
  - `restore()`: 다시 연결
  - `incoming(tripId, text)`: 다른 동행의 메시지 흉내
  - `skipNext()`: 다음 실시간 하나를 빠뜨려 빈칸 만들기
  - `dropResponse()`: 다음 보내기를 저장만 하고 응답은 실패시키기. 다시 보내기의 중복 방지를 확인한다
  - `seedLongRoom(tripId, count)`: 긴 대화 만들기. 스크롤 성능 측정용
