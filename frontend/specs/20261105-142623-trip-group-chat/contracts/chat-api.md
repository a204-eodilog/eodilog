# Contract: 채팅 REST API

근거는 2026-11-05 백엔드 코드와 [API 명세 §9](../../../../docs/api-spec.md)다.

- 백엔드 코드: `chat/controller/ChatController.java`, `chat/dto/*`, `chat/exception/ChatErrorCode.java`
- 경로 앞에는 `/api/v1`이 붙는다.
- 모든 요청은 `Authorization: Bearer <access>`를 쓰고, `apiClient`가 붙인다.

## 1. 내 대화방 목록

`GET /chat/rooms?cursor=&limit=`

- **`limit`**: 1~100, 기본 20. 앱은 100으로 보내고 `hasNext`가 `false`일 때까지 이어 받는다.
- **응답 200**: `{ data: ChatRoom[], page: { nextCursor: string|null, hasNext: boolean } }`. 공통 `PageResponse`와 같은 모양이다.
- **순서**: 방을 만든 역순(`createdAt DESC, id DESC`)이다. 최근 메시지 순 정렬은 앱이 한다(research R12).
- **포함 범위**: 지금 접근할 수 있는 방만 온다. ACTIVE 멤버이고 삭제되지 않은 여행의 방이다.

## 2. 여행의 대화방

`GET /trips/{tripId}/chat-room`

- **응답 200**: `{ data: ChatRoom }`
- **404 `TRIP_NOT_FOUND`**: 여행이 없거나 삭제됐거나, 내가 참여하지 않았거나 나갔을 때다. 차단으로 다룬다.

## 3. 메시지 목록

`GET /chat/rooms/{roomId}/messages?beforeSequence=&limit=`

- **`beforeSequence`**: 1 이상. 이 값보다 작은 메시지만 온다(경계값은 포함하지 않는다). 첫 페이지는 생략한다.
- **`limit`**: 1~100, 기본 20.
  - 처음 열기 30
  - 이전 메시지 50
  - 이어 받기·빈칸 채우기 100(최대)
- **`cursor`는 보내지 않는다**: 같이 보내면 400이다.
- **응답 200**: `{ data: Message[], page: { nextBeforeSequence: number|null, hasNext: boolean } }`
  - `data` 바깥을 `DataResponse`로 한 번 더 감싸지 않는다.
  - `data`는 `sequence` 내림차순이다. 앱은 오름차순으로 뒤집어 합친다.
  - `nextBeforeSequence`는 이 페이지의 가장 작은 `sequence`다. 더 없으면 `null`이다.
- **404 `CHAT_ROOM_NOT_FOUND`**: 없는 방, 삭제된 여행의 방, 참여하지 않았거나 나간 방이다. 서버는 이 셋을 구분하지 않는다.

## 4. 메시지 보내기

`POST /chat/rooms/{roomId}/messages`

```json
{ "clientMessageId": "6d0f7c2e-1b7a-4f0e-9a51-7f3c1e2d4b8a", "text": "내일 9시에 만나요" }
```

- **`clientMessageId`**: 메시지마다 새 UUID다. 다시 보낼 때는 같은 값을 쓴다.
- **`text`**: 받은 그대로 저장된다. 공백만 있거나 NUL 문자가 들어 있으면 400이다. 최대 1,000 코드 포인트다(`ChatService.TEXT_MAX_LENGTH`).
- **응답 201**: `{ data: Message }`
  - 같은 보낸 사람, 같은 `clientMessageId`, 같은 방, 같은 본문이면 처음 메시지를 다시 돌려준다. 이때도 201이고, 실시간 이벤트는 다시 보내지 않는다.

| 상태·코드                      | 언제                                     | 앱 처리(`sendFailure`)                              |
| ------------------------------ | ---------------------------------------- | --------------------------------------------------- |
| 400 `VALIDATION_ERROR`         | 공백만, NUL, 1,000자 초과, `cursor` 섞음 | `rejected`. 보내기 전에 막으므로 보통 생기지 않는다 |
| 401 `UNAUTHENTICATED`          | 토큰 만료                                | `apiClient`가 갱신한 뒤 한 번 다시 보낸다           |
| 404 `CHAT_ROOM_NOT_FOUND`      | 나갔거나 내보내졌거나 여행이 삭제됨      | `blocked`                                           |
| 409 `CLIENT_MESSAGE_ID_REUSED` | 같은 ID를 다른 방·다른 본문에 씀         | `rejected`. 메시지마다 새 ID를 쓰므로 생기지 않는다 |
| 429 `RATE_LIMITED`             | 요청이 너무 많음                         | `retry`                                             |
| 5xx·네트워크·시간 초과(10초)   | 서버·연결 문제                           | `retry`                                             |

## 공통 모양

```text
ChatRoom = { id, type: 'TRIP', tripId, participants: UserCard[], lastMessage: Message | null }
Message  = { id, roomId, sequence, senderId|null, type: 'TEXT'|'SYSTEM', text|null,
             clientMessageId|null, eventId|null, target: {type,id}|null, eventReadAt|null,
             createdAt, deletedAt|null }
```

- **시스템 메시지**: `eventId`·`target`·`eventReadAt`은 지금 항상 `null`이다. 서버가 아직 SYSTEM 메시지를 만들지 않는다.
- **지운 메시지**: 나가며 "내 채팅 삭제"를 고른 사람의 메시지다. `deletedAt`에 값이 있고 `text`가 `null`이다. 자리(`sequence`)는 남는다.
