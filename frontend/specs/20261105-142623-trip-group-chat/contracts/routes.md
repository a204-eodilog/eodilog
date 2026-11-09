# Contract: 주소와 이동

| 화면            | 주소                   | 파일                                     | 비고                                   |
| --------------- | ---------------------- | ---------------------------------------- | -------------------------------------- |
| S46 대화방 목록 | `/chats`(탭)           | `src/app/(main)/(tabs)/chats.tsx`        | 고침: '준비 중' 자리를 화면으로 바꾼다 |
| S47 대화방      | `/trips/[tripId]/chat` | `src/app/(main)/trips/[tripId]/chat.tsx` | 새로. 탭 막대 없음                     |
| 미리보기        | `/dev/chats`           | `src/app/dev/chats.tsx`                  | 새로. 개발 빌드에서만 연다             |

## 이동 규칙

- **S46 → S47**: `router.push({ pathname: '/trips/[tripId]/chat', params: { tripId } })`. 누른 방의 `ChatRoom`으로 `['trips', tripId, 'chat-room']`을 미리 채운다.
- **S17 → S47**: `trip-menu-grid.tsx`의 `chat` 항목 `open`으로 같은 주소로 간다. 이전 명세 파일 고침이다.
- **S46 대화방 없음 → S16**: `router.push('/trips/new')`
- **S47 차단 → S46**: [대화방 목록으로]를 누르면 `router.dismissAll()` 뒤 `router.navigate('/chats')`. 뒤로 가기로 차단된 방에 돌아오지 않게 한다.
- **S47 시스템 카드 버튼**: `SYSTEM_CARD_ROUTES[kind]`가 없으면 `toast.show('준비 중이에요')`. 투표·코스 명세에서 표를 채운다.
- **나가기·삭제 뒤**: 이전 명세의 `exitTrip`이 `dismissAll`로 S47도 닫는다. 이번에 `['chat','rooms']`에서 빼기와 보내는 중 큐 비우기를 더한다.
