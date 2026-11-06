# S37 마이페이지

담당 A · 핵심 · 요구사항 WD-FR-27 · 마이페이지 탭

구현 `frontend/src/features/mypage`, 탭 `src/app/(main)/(tabs)/me.tsx`, 미리보기 `/dev/mypage?state=basic|empty|loading|error`.

| 상태               | 피그마                                                                                | 이번에 만듦                 |
| ------------------ | ------------------------------------------------------------------------------------- | --------------------------- |
| 기본               | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-20528) | 예                          |
| 기록 없음          | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-20892) | 예                          |
| 지도 불러오기 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31205) | 나중(지금은 화면 전체 오류) |

## 기본

1. 제목 "마이페이지"(`title1`), 프로필(얼굴 48 + 닉네임 `title2` + "다녀온 여행 4개 · 게시 1개")
2. [친구에게 보이는 모습] 연한 파랑 알약 → S40
3. 내 여행 지도 카드(높이 250). 홈과 같은 SVG 지도, 손가락 확대는 끔(세로 스크롤 우선). 처음 화면은 핀 범위에 맞춰 확대(핀 하나면 1.4배)
   - 핀: 다녀온(COMPLETED) 여행의 첫 지역. 게시한 여행은 파란 알약(사람 아이콘), 게시 전은 흰 알약(자물쇠). 같은 지역 여러 여행은 "봄 경주 외 1개"
   - 아래 범례: ● 게시됨 · 🔒 비공개 · 나만 봐요
4. [내 여행 목록] 카드 "7개 · 핀 없는 여행 1개 포함" → N4 `/my-trips`
5. 타일 3개: 타임라인(S41, 준비 중) · 친구 N명(S43 `/friends`) · 설정(S45 `/settings`)

기록 없음: 지도를 옅게 깔고 "아직 기록한 여행이 없어요 / 다녀온 여행을 기록하면 여기에 핀이 생겨요. 게시하기 전에는 나만 봐요" + [여행 만들기] → S16. 여행이 하나도 없으면 [내 여행 목록]도 숨긴다.

## 값 (`mypage-rules.toMyPageSummary`)

- `GET /me/trips`(첫 쪽 100), `GET /me/feeds`(게시한 피드, 지역 코드 포함), `GET /me/following`(친구 수, 다음 쪽이 있으면 수를 숨김)
- 게시 전 여행은 지역 ID만 있어 `GET /regions/{id}`로 코드를 받아 지도 자리를 찾는다

## 백엔드에 필요한 것

1. 마이페이지 요약 수(다녀온 여행·게시·팔로잉 수)를 한 번에 주면 목록 여러 개를 부르지 않아도 된다
2. `Trip`에 여행지 지역 코드(또는 Region)가 있으면 `/regions/{id}`를 따로 부르지 않아도 된다
