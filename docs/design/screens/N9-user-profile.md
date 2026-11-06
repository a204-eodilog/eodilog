# N9 다른 사용자 프로필

담당 A · 완성도 · 요구사항 WD-FR-02, 27 · S43·S44·S07에서 들어온다

구현 `frontend/src/features/people`, 주소 `/users/[userId]`, 미리보기 `/dev/user?state=public|private`.

| 상태              | 피그마                                                                               | 이번에 만듦 |
| ----------------- | ------------------------------------------------------------------------------------ | ----------- |
| 공개 계정, 팔로잉 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-1303) | 예          |
| 비공개 계정       | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-2062) | 예          |

- 머리: 뒤로 + 닉네임
- 프로필: 얼굴 48 + 닉네임 + "공동 피드 3개 · 팔로워 12 · 팔로잉 9"(비공개는 "비공개 계정 · …")
- 팔로우 버튼(팔로잉 회색 / 비공개 계정은 "팔로우 요청")
- 공개 계정이거나 팔로잉이면 공동 피드 지도(`GET /users/{userId}/feeds`, 핀을 누르면 S07) + 범례 "● 공동 피드 · 눌러서 보기"
- 비공개 계정을 아직 팔로우하지 않았으면 "비공개 계정이에요 / 팔로우가 수락되면 여행을 볼 수 있어요"

## 백엔드에 필요한 것

1. **`GET /users/{userId}`가 `UserCard`만 준다.** 공동 피드 수·팔로워 수·팔로잉 수가 없어 한 줄을 그릴 수 없다. 오면 보이고 없으면 그 칸을 뺀다
2. 지도는 명세의 `GET /users/{userId}/feed-map`(MapResult)을 쓰는 게 맞다. 지금은 `/feeds` 목록의 첫 지역으로 핀을 찍는다(제목을 보이려고)
