# S34 평점·평가 작성

담당 B · 완성도 · 요구사항 WD-FR-21 · 여는 곳 S33 [평가하기]

화면 규칙은 [화면 목록](../../flow/screen-list.md) S34 줄: 별점 5점·1점 단위, 한 줄 평가, 본인만 수정·삭제.

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 작성 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-18768) | 아래 "작성" 그대로 |
| 남긴 뒤 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-18933) | 별점·입력 칸 대신 "내 평가" 카드(동행 평가 카드와 같은 모양, 내 얼굴은 연파랑) + 카드 안 글자 버튼 [수정] [삭제]. 상단 제목 "평가". 토스트 "평가를 남겼어요" |
| 저장 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-30839) | 맨 위 연빨강 오류 상자 "평가를 저장하지 못했어요", "저장하지 못했어요. 다시 눌러 주세요". 입력값 그대로, 버튼 [다시 저장] |

## 작성

1. **상단 바** — [뒤로], 제목 "평가 남기기" `typography.bodyBold` + "겨울 여행", 오른쪽 동행 얼굴 묶음 24
2. **본문** — 위 16, 좌우 20, 섹션 간격 24
   1. **장소 줄**(간격 14) — 사진 56x56 둥글기 14 · 이름 `typography.bodyBold`, 아래(간격 8) [달력 아이콘 16 + "1일차 · 11.14(토) 10:00" `typography.caption`] + 초록 태그 "사진으로 확인됨"([S33](S33-visit-review-list.md#기본)과 같음)
   2. **별점** — 별 5개 가로, 한 칸 누르는 영역 44, 별 아이콘 36. 오른쪽 "4점" `typography.title1`. 위아래 여백 4
   3. **한 줄 평가** — 이름 "한 줄 평가" `typography.bodyBold`, 간격 12, 회색 상자 입력 칸 높이 48(배경 `colors.surface.default`, 둥글기 12, 좌우 16, `typography.body`)
   4. **동행 평가** — 제목 `typography.title3`, 카드 간격 12. 카드: 배경 `colors.surface.default`, 둥글기 `radius.lg`(16), 안쪽 18/20, 세로 10
      - 머리 줄(간격 10): 얼굴 28 · 이름 `typography.bodyBold` · 작은 별 14 다섯 개(간격 1) · 오른쪽 끝 날짜 "11.15(일)" `typography.caption` `colors.text.sub`
      - 평가 글 `typography.body`
3. **아래 버튼** — 오른쪽 알약 주 버튼 48: 체크 아이콘 20 + "저장"

## 공통 부품과 맞지 않는 점

- 별점 입력과 작은 별 표시는 공통 부품이 없다. S07(A 친구 여행 상세)에서도 평점이 나오므로 별 아이콘은 공통 `Icon`에 넣는 게 좋다.
- 회색 상자 입력 칸은 [S11](S11-link-capture.md#공통-부품과-맞지-않는-점)과 같은 요구.

## 예시 데이터

동행 평가: 서연(11.15(일)) "사진 찍기 좋은 곳이에요", 민준(11.16(월)) "사람이 많았지만 바다가 예뻐요". 내 평가 4점 "파도 소리 들으며 걷기 좋았어요".

## 버튼과 이동

[사용자 흐름](../../flow/user-flow.md) 기준. 누르는 것마다 어디로 가는지와 어떤 API를 부르는지.

| 누르는 것 | 어디서 | 동작·이동 |
| --- | --- | --- |
| [뒤로] | 상단 바 | S33. 입력한 것이 있으면 버릴지 확인 |
| 별 5개 | 작성 | 1~5점 고르기. 점수를 골라야 [저장] 가능 |
| [저장] | 작성 | `PUT /trips/{tripId}/visits/{visitId}/review` (점수 1~5 정수, 글) → 남긴 뒤 상태 + 토스트 "평가를 남겼어요" |
| [다시 저장] | 저장 실패 | 같은 내용 다시 저장 |
| [수정] | 남긴 뒤 · 내 평가 카드 | 작성 상태로 돌아가 내 점수·글을 채워 둠 → 같은 `PUT`(expectedVersion 포함) |
| [삭제] | 남긴 뒤 · 내 평가 카드 | `DELETE /trips/{tripId}/visits/{visitId}/review`. 확인창(S50)을 띄울지는 화면 목록에 없어 결정 필요. 지우면 작성 상태로 |
