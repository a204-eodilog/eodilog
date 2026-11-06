# S40 친구에게 보이는 모습

담당 A · 완성도 · 요구사항 WD-FR-27 · S37·S39에서 들어온다

구현 `frontend/src/features/mypage`(friend-preview), 주소 `/visible-to`, 미리보기 `/dev/visible-to?state=basic|no-friends|loading|error`.

| 상태           | 피그마                                                                                | 이번에 만듦    |
| -------------- | ------------------------------------------------------------------------------------- | -------------- |
| 특정 친구 기준 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-22631) | 예             |
| 불러오기 실패  | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31785) | 화면 전체 오류 |

- 위 친구 칩(가로 스크롤, 얼굴 + 이름). 처음은 첫 친구
- 👁 "하늘님에게 이렇게 보여요", 그 친구에게 보이는 공동 피드 지도(S37과 같은 핀)
- 공동 피드 카드(표지 88 + 제목 + 기간 + 실린 것: 사진·경로·평점) → S07
- 🔒 "하늘님에게 숨긴 여행 3개 / 숨긴 여행 3개는 동행 피드에서는 보일 수 있어요"
- 나를 팔로우하는 친구가 없으면 안내

값: `GET /me/followers`, `GET /me/feeds`의 `visibility.hiddenViewerUserIds`(`preview-rules.viewFor`).

## 백엔드에 필요한 것

1. 명세의 `GET /feeds/{feedId}/preview?viewerId=`는 피드 하나씩이라, 친구 기준 내 프로필 전체 미리보기 API가 있으면 서버 판정(계정 공개 범위 포함)을 그대로 쓸 수 있다. 지금은 숨김 목록만으로 계산
2. 카드의 "하늘과 함께"(동행 이름)는 `Feed`에 동행이 없어 비운다(S07과 같은 요청)
