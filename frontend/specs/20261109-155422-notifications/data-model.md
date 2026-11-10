# Data Model: 인앱 알림

## NotificationView (서버)

| 필드 | 타입 | 설명 |
|---|---|---|
| id | string | 알림 번호 |
| eventId | string | 이벤트 번호 |
| kind | string | POLL_OPENED, POLL_CANDIDATE_ADDED, POLL_FINALIZED, POLL_CLOSED_NO_VOTES, POLL_REMINDER, COURSE_CHANGED, TRIP_INFO_CHANGED, TRIP_MEMBER_JOINED, FOLLOW_REQUESTED, FOLLOW_ACCEPTED, AI_PROPOSAL_READY, 그 밖 |
| message | string \| null | 서버 문장 |
| target | {type, id} \| null | POLL, TRIP, ITINERARY, USER, PROPOSAL |
| tripId | string \| null (선택) | Q-12-1, 서버에 아직 없음 |
| readAt | string \| null | 읽은 시각 |
| createdAt | string | 만든 시각 |

## 화면 값

- **NotificationLine**: id, title, label, icon, time, unread, leftTrip.
- **Section**: '오늘' | '이전', lines.
- **Destination**: `{ kind: 'route', href, tripId }` | `{ kind: 'none' }`.
- **PopupChoice**: `null` | `{ kind: 'poll', item }` | `{ kind: 'many', items }`.

## 상태

- 줄: 안 읽음 → (누름·모두 읽음) → 읽음. 지우기 → 목록에서 빠짐.
- 팝업: 숨김 → (실행·복귀, 새 행동 알림) → 보임 → (닫기·이동) → 숨김. 보여 준 번호는 다시 고르지 않는다.
