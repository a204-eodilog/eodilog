# Data Model: 여행 그룹 채팅

서버 모양은 [contracts/chat-api.md](./contracts/chat-api.md)를 따른다. 여기서는 앱이 쓰는 타입, 계산 함수, 상태를 적는다.

## 서버 타입: `features/chat/types.ts`

```ts
type ChatRoom = {
  id: string;
  type: 'TRIP';
  tripId: string;
  participants: UserCard[]; // 지금 참여 중인 동행(참여 순)
  lastMessage: Message | null;
};

type Message = {
  id: string;
  roomId: string;
  sequence: number; // 방 안에서 1부터 빈틈없이 늘어난다
  senderId: string | null; // 시스템 메시지는 null
  type: 'TEXT' | 'SYSTEM';
  text: string | null; // 지운 메시지·시스템 메시지는 null일 수 있다
  clientMessageId: string | null;
  eventId: string | null; // 시스템 카드. 아직 항상 null
  target: { type: string; id: string } | null;
  eventReadAt: string | null;
  createdAt: string; // UTC
  deletedAt: string | null; // "내 채팅 삭제"로 지운 시각
};

type MessagePage = {
  data: Message[]; // sequence 내림차순
  page: { nextBeforeSequence: number | null; hasNext: boolean };
};

type ChatRealtimeEvent = { type: 'MESSAGE_CREATED'; roomId: string; message: Message };
```

## 메시지 창: `MessageWindow`

캐시 `['trips', tripId, 'chat-messages']`의 값이다. 한 방에서 지금까지 받은 메시지를 한 줄로 이어 둔다.

```ts
type MessageWindow = {
  roomId: string;
  messages: Message[]; // sequence 오름차순, 중복 없음
  oldestSequence: number | null; // 받은 것 중 가장 작은 sequence
  newestSequence: number | null; // 받은 것 중 가장 큰 sequence
  hasOlder: boolean; // 서버에 더 오래된 메시지가 있는지(마지막 이전 페이지의 hasNext)
  stale: boolean; // 연결이 끊겼던 사이 받지 못했을 수 있다. 열면 이어 받는다
};
```

- **불변 규칙**:
  - `messages`는 `sequence` 오름차순이다.
  - `id`는 겹치지 않는다.
  - 같은 `sequence`는 하나만 있다.
  - 이 규칙은 `mergeMessages`가 지킨다.
- **빈칸**: `newestSequence`와 실시간 메시지 사이만 생긴다. 처음 받기와 이전 메시지 받기는 연속 페이지라 사이가 비지 않는다.

## 보내는 중인 메시지: `useChatOutbox`(zustand, 메모리)

```ts
type OutboxItem = {
  clientMessageId: string; // randomUUID. 다시 보내도 같은 값
  roomId: string;
  text: string;
  status: 'sending' | 'failed';
  failure: 'retry' | 'rejected' | null; // rejected면 [다시 보내기] 없음
  queuedAt: number; // 보낸 순서. 화면 맨 아래 정렬 기준
};

type ChatOutboxState = {
  items: Record<string, OutboxItem[]>; // roomId별
  enqueue(roomId, text): OutboxItem;
  markFailed(roomId, clientMessageId, failure): void;
  retry(roomId, clientMessageId): void; // failed → sending
  remove(roomId, clientMessageId): void; // 성공·[지우기]
  clearRoom(roomId): void; // 차단·나가기
  clearAll(): void; // 로그아웃
};
```

- **상태 전이**: `sending` →(201)→ 지움, `sending` →(실패)→ `failed`, `failed` →([다시 보내기])→ `sending`, `failed` →([지우기])→ 지움.
- **서버 메시지와 짝 맞추기**: 같은 방에 내가 보낸 같은 `clientMessageId`의 서버 메시지가 들어오면, 상태와 관계없이 지운다(`reconcileOutbox`).

## 연결 상태: `src/realtime`

```ts
type ConnectionState =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected' }
  | { kind: 'reconnecting'; attempt: number; since: number } // since: 끊긴 시각(ms)
  | { kind: 'paused' } // 백그라운드
  | { kind: 'stopped'; reason: 'auth' | 'profile' | 'forbidden' };

type ConnectionEvent =
  | { type: 'start' }
  | { type: 'connected' }
  | { type: 'dropped'; at: number }
  | { type: 'authFailed'; reason: 'auth' | 'profile' | 'forbidden' }
  | { type: 'background' }
  | { type: 'foreground' }
  | { type: 'online' }
  | { type: 'signOut' };
```

- `nextConnection(state, event): ConnectionState`. 전이표는 [research R4](./research.md)다.
- `reconnectDelay(attempt): number`. 1→1000, 2→2000, 3→4000, 4→8000, 5→16000, 6 이상→30000(ms).
- `showDisconnected(state, now): boolean`. `reconnecting`이고 `now - since >= 3000`이거나 `stopped`이면 `true`.
  - `paused`·`connecting`·`idle`이면 `false`.
  - 끊긴 뒤 처음 연결 중일 때는 `reconnecting`으로 잡히므로 3초 규칙을 따른다.

## 계산 함수

### `features/chat/message-merge.ts`

| 함수                                         | 입력 → 출력                                    | 규칙                                                                                                                                                       |
| -------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `emptyWindow(roomId)`                        | → `MessageWindow`                              | 비어 있고 `hasOlder: true`, `stale: false`                                                                                                                 |
| `mergeMessages(window, incoming, opts?)`     | `MessageWindow`, `Message[]` → `MessageWindow` | `id` 중복 제거, 같은 `sequence`는 들어온 것으로 덮어쓰기, 오름차순, oldest·newest 다시 계산. `opts.hasOlder`가 있으면 그 값으로 바꾼다. 원본은 그대로 둔다 |
| `findGap(window, message)`                   | → `{ after, before } \| null`                  | `newestSequence`가 없으면 `null`. `message.sequence > newest + 1`이면 빈칸                                                                                 |
| `nextFillRequest(window, gap)`               | → `{ beforeSequence, limit } \| null`          | `after + 1`까지 다 채웠으면 `null`. 아니면 `beforeSequence = 채운 것 중 가장 작은 sequence(없으면 gap.before)`, `limit = min(100, 남은 수)`                |
| `nextCatchUpRequest(window, latestPage)`     | → `{ beforeSequence } \| null`                 | 최신 페이지를 받은 뒤 `newestSequence`(받기 전 값)까지 닿았으면 `null`                                                                                     |
| `reconcileOutbox(items, messages, myUserId)` | → `OutboxItem[]`                               | 서버에 나타난 내 `clientMessageId` 항목을 뺀다                                                                                                             |
| `latestOf(a, b)`                             | `Message \| null` 두 개 → 더 큰 `sequence`     | 대화방 목록의 최근 메시지 바꾸기                                                                                                                           |

### `features/chat/chat-rules.ts`

| 함수                                 | 규칙                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateMessageText(text)`          | `'ok' \| 'empty' \| 'tooLong'`. 앞뒤 공백을 지우고 비면 `empty`. 코드 포인트 수가 1000보다 크면 `tooLong`. 이모지 하나는 1로 센다                   |
| `sendFailure(error)`                 | `'retry' \| 'blocked' \| 'rejected'`. 표는 research R8                                                                                              |
| `isBlocked(error)`                   | 404 `CHAT_ROOM_NOT_FOUND`·`TRIP_NOT_FOUND`면 `true`                                                                                                 |
| `sortRooms(rooms)`                   | 최근 메시지 시각 내림차순. 메시지 없는 방은 뒤(서버 순서 유지)                                                                                      |
| `roomPreview(room, meId)`            | 목록 한 줄. `deletedAt`이면 "삭제된 메시지예요". 시스템이면 카드 문구. 사람이면 `닉네임: 본문`. 내 것이면 "나: 본문". 없으면 "아직 메시지가 없어요" |
| `senderLabel(message, participants)` | 동행이면 닉네임. 없으면 "나간 동행". 시스템이면 `null`                                                                                              |
| `systemCard(message)`                | `{ kind: 'poll' \| 'course' \| 'other', text, action: { label } \| null }`. research R13                                                            |
| `messageTimeLabel(iso)`              | 서울 시각 "오후 3:05"                                                                                                                               |
| `dayDividerLabel(iso)`               | 서울 날짜 "11월 5일 목요일"                                                                                                                         |

### `features/chat/chat-items.ts`

`toChatItems(window, outbox, ctx)` → `ChatItem[]`. 이것이 FlashList 데이터다.

```ts
type ChatItem =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'message';
      key: string;
      message: Message;
      mine: boolean;
      showSender: boolean;
      senderName: string | null;
      time: string;
      deleted: boolean;
    }
  | { kind: 'system'; key: string; card: SystemCard; time: string }
  | { kind: 'outbox'; key: string; item: OutboxItem };
```

- `key`는 서버 메시지면 `id`, 보내는 중이면 `clientMessageId`다.
  - 보내는 중 → 서버 메시지로 바뀌면 key가 바뀐다. 그래서 한 프레임 깜빡임이 있을 수 있다. 측정 항목에서 본다.
- 날짜 줄은 서울 날짜가 바뀌는 첫 메시지 앞에 넣는다. 보내는 중인 메시지는 오늘 날짜로 본다.
- `showSender`: 바로 앞 줄이 같은 사람의 메시지이고 같은 서울 '분'이면 `false`.

## 캐시 키

| 키                                   | 값                    | 바뀌는 때                                                                    |
| ------------------------------------ | --------------------- | ---------------------------------------------------------------------------- |
| `['chat','rooms']`                   | `ChatRoom[]`(정렬 전) | S46 열기, 실시간 메시지(`lastMessage`), 다시 연결(무효화), 차단·나가기(빼기) |
| `['trips', tripId, 'chat-room']`     | `ChatRoom`            | S47 열기(S46 값으로 미리 채움), 낯선 보낸 사람(무효화)                       |
| `['trips', tripId, 'chat-messages']` | `MessageWindow`       | 처음 받기, 이전 메시지, 실시간, 빈칸 채우기, 이어 받기, 보내기 성공          |

`['trips', tripId, …]` 아래 두 키는 이전 명세의 `forgetTrip`이 같이 지운다.

## 메모리 표: `features/chat/room-index.ts`

- `rememberRooms(rooms)`, `tripIdOf(roomId)`, `forgetRoom(roomId)`, `clearRoomIndex()`
- 실시간 이벤트의 `roomId`로 캐시 키를 찾을 때 쓴다.
