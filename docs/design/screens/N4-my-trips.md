# N4 내 여행 목록

담당 B · 완성도 · 요구사항 WD-FR-27 · 여는 곳 S37 [내 여행 목록]

화면 규칙은 [화면 목록](../../flow/screen-list.md) N4 줄: 핀이 없는 여행까지 모든 여행, 공동 피드 상태. API `GET /me/trips`가 있다.

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 기본 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-21213) | 아래 "기본" 그대로 |
| 불러오기 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31328) | 아래 "불러오기 실패" 참고 |

## 기본

1. **상단 바** — [뒤로] + 큰 제목 "내 여행" `typography.title1`
2. **본문** — 위 16, 좌우 20, 간격 20
   - 안내 "핀 없는 여행까지 보여요" `typography.caption` `colors.text.sub2`
   - **묶음**(제목과 목록 8): 왼쪽 "다녀온 여행" `typography.title3`, 오른쪽 "4개" `typography.caption` `colors.text.icon`. 두 번째 묶음 "계획 중인 여행 3개"
   - **여행 줄**(높이 72~86, 간격 18): 대표 사진 56x56 둥글기 14(사진이 없으면 배경 `colors.brand.primaryBg` + 여행 아이콘 24) · 가운데(세로 8)
     - 이름 줄(간격 8): 여행 이름 `typography.bodyBold` + 상태 태그(높이 24, 좌우 8, 둥글기 8, 아이콘 14 + `typography.captionMedium`)
       - "비공개": 배경 `colors.surface.default`, 글자 `colors.text.icon`
       - "게시됨": 배경 `colors.brand.primaryLight`, 글자 `colors.brand.primaryDark`
     - 정보 줄(간격 12): [달력 아이콘 16 + "11.14 – 11.15"] [사람 아이콘 16 + "서연, 민준"] `typography.caption` `colors.text.icon`
     - 셋째 줄(있을 때만)
       - 게시됨: "친구 4명이 봐요" `typography.caption` `colors.brand.primaryDark`
       - 지도에 핀이 없는 여행: 흰 태그 "지도 핀 없음"(핀 아이콘 14) + "위치 없는 사진만 있어요" `typography.caption`
   - 줄을 누르면 S38

## 공통 부품과 맞지 않는 점

- 상태 태그(둥글기 8)는 S12·S14·S33과 같은 모양이다. 공통 **태그**로 만들면 함께 쓴다.

## 예시 데이터

다녀온 여행: 겨울 여행(11.14 – 11.15, 서연·민준, 비공개), 여름 캠핑(08.08 – 08.09, 하늘, 비공개, 지도 핀 없음), 봄 경주(04.11 – 04.12, 서연, 게시됨, 친구 4명이 봐요).

## 불러오기 실패

[README 상태 공통 모양](README.md#상태-공통-모양)의 **가운데 안내 화면**(좌우 36): 아이콘 동그라미가 연파랑(`colors.brand.primaryBg`), "내 여행 목록을 불러오지 못했어요", "불러오지 못했어요. 다시 시도해 주세요.", [다시 시도], 글자 버튼 "돌아가기"

## 버튼과 이동

[사용자 흐름](../../flow/user-flow.md) 기준. 누르는 것마다 어디로 가는지와 어떤 API를 부르는지.

| 누르는 것 | 어디서 | 동작·이동 |
| --- | --- | --- |
| [뒤로] | 상단 바 | S37 |
| 여행 줄 | 기본 | S38 내 여행 기록 |
| [다시 시도] | 불러오기 실패 | `GET /me/trips` 다시 |
| [돌아가기] | 불러오기 실패 | S37 |
