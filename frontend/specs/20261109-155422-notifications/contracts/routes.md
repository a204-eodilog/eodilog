# Contracts: 주소와 API

## 주소

| 주소 | 화면 |
|---|---|
| `/notifications` | S49 목록 |
| `/notifications/gone?id=` | S49 볼 수 없음 |
| `/dev/notifications?state=list\|empty\|error\|gone\|popup-many\|popup-poll` | 미리보기 |

## API (서버 `/api/v1`)

| 요청 | 응답 | 쓰는 곳 |
|---|---|---|
| GET /me/notifications?unreadOnly&cursor&limit | `{data: NotificationView[], page: {nextCursor, hasNext}}` | 목록, 팝업 |
| PATCH /me/notifications/{id} `{read:true}` | `{data: NotificationView}` | 열기 |
| DELETE /me/notifications/{id} | 204 | 볼 수 없음 지우기 |
| POST /me/notifications/read-all `{through}` | `{data: {updatedCount}}` | 모두 읽음 |
| GET /me/notification-summary | `{data: {unreadCount, asOf}}` | 홈 종 숫자(기존) |
| GET /trips/{tripId} | 404·403이면 볼 수 없음 | 열기 전 확인 |
| GET /trips/{tripId}/polls/{pollId} | `{data: {type, closesAt}}` | 투표 시작 팝업 |
