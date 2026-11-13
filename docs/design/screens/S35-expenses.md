# S35 경비 목록·지출 입력

담당 B · 시연 단계 완성도 · 요구사항 WD-FR-22 · API `GET/POST/PATCH/DELETE /trips/{tripId}/expenses` ([명세](../../api-spec.md))

화면 규칙은 [화면 목록](../../flow/screen-list.md) S35 줄을 따른다: 지출 목록과 합계, 등록한 사람 표시, 지출 추가(금액·낸 사람·나눌 사람, 균등 분담), 등록자만 수정·삭제, 원화·1명 금액 10원 단위 올림, [정산 계산].

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 기본 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-19096) | 아래 "기본 화면" 그대로 |
| 지출 없음 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-19260) | 아래 "그 밖의 상태" 참고 |
| 정산 후 지출 변경 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-19308) | 아래 "그 밖의 상태" 참고 |
| 지출 추가 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-19508) | 별도 화면. 아래 "지출 추가 화면" |
| 지출 저장 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31016) | 아래 "그 밖의 상태" 참고 |

## 기본 화면

위에서 아래로. 화면 좌우 여백 `layout.screenPaddingX`(20).

1. **상단 바** `Header` — 높이 56, 왼쪽 [뒤로], 제목 "경비" `typography.bodyBold`, 제목 아래 가방 아이콘(`Icon trip`, 16) + 여행 이름 "겨울 여행" `typography.caption` `colors.text.icon`, 오른쪽 [+](`Icon plus`, 24) = 지출 추가
2. **합계 상자** — 위 여백 16. 배경 `colors.surface.default`, 둥글기 `radius.xl`(20), 안쪽 여백 20
   - "함께 쓴 돈" `typography.caption` `colors.text.icon`
   - "23.4만 원" `typography.title1` `colors.text.default` — 만 원 단위로 줄여 보여 준다
3. **지출 목록** — 합계 상자와 간격 24
   - 제목 "지출 3건" `typography.title3`, 제목과 목록 간격 8
   - 줄 사이 간격 6, 한 줄 높이 64, 줄 안 요소 간격 `spacing[18]`
   - 한 줄: 낸 사람 얼굴(36, 동그라미) · 가운데 글자 · 오른쪽 금액
     - 지출 이름 `typography.bodyBold` `colors.text.default`
     - 그 아래 간격 2, 두 묶음 가로 간격 12: [카드 아이콘 16 + "지우가 냄"], [사람 아이콘(`Icon people`, 16) + "3명 똑같이"] — 둘 다 `typography.caption` `colors.text.icon`, 아이콘과 글자 간격 6
     - 나눌 사람이 일부면 "서연, 지우 2명"처럼 이름을 쓴다
     - 금액 "180,000원" `typography.bodyBold`, 오른쪽 정렬
   - 줄 전체를 누르면 지출 상세·수정(등록자만)
4. **아래 버튼** — 오른쪽 정렬, 아래 여백 34, 위 여백 12. 알약 모양 주 버튼 높이 48(`size.button.lg`), 계산기 아이콘(흰색, 20) + "정산 계산" `typography.bodyMedium` 흰색. 왼쪽 안쪽 여백 20, 오른쪽 24

## 지출 추가 화면

상단 바는 [닫기](`Icon close`) + 제목 "지출 추가" + 여행 이름. 오른쪽 버튼 없음. 섹션 사이 간격 24, 섹션 제목과 내용 간격 12. 섹션 제목은 모두 `typography.bodyBold`.

1. **금액** — 입력 상자 높이 56, 배경 `colors.surface.default`, 둥글기 14, 좌우 여백 16. 숫자 "21,000"과 오른쪽 "원" 모두 `typography.title1`. 숫자 키패드, 천 단위 쉼표
2. **낸 사람** — 한 명만 고르는 알약 칩, 칩 사이 간격 10. 칩 높이 40, 왼쪽 여백 6·오른쪽 14, 얼굴(28)과 이름 간격 8, 이름 `typography.bodyMedium`
   - 고른 칩: 배경 `colors.brand.primaryLight`, 이름 `colors.brand.primaryDark`
   - 안 고른 칩: 배경 `colors.surface.default`, 이름 `colors.text.icon`
   - 내 이름 뒤에 " (나)"
3. **나눌 사람** — 제목 오른쪽 끝에 "2명 선택" `typography.caption` `colors.text.icon`. 여러 명 고르는 칩, 모양은 낸 사람과 같고 고른 칩은 색만 바뀐다(2026-11-13 사용자 결정: 낸 사람 칩과 모양을 맞춰 체크 표시를 뺌)
   - 칩 아래 안내 "10원 단위로 올려서 나눠요"(2026-11-13 사용자 요청: "나눌 사람" 제목과 겹치는 앞부분을 뺌) — 13/20 보통 굵기 `colors.text.icon` (토큰 없음, 아래 참고)
4. **항목 이름** — 입력 상자 높이 48, 배경 `colors.surface.default`, 둥글기 `radius.md`(12), 좌우 여백 16, 글자 `typography.body`
5. **아래 버튼** — 오른쪽 정렬, 알약 주 버튼 48: 체크 아이콘(흰색, 20) + "저장"

## 얼굴 모양

피그마에서 **나**는 다른 사람과 색이 다르다. 지금 `Avatar`는 모두 회색이라 이 구분이 없다.

| 누구 | 배경 | 글자 |
| --- | --- | --- |
| 나 | `colors.brand.primaryLight` | `colors.brand.primaryDark` |
| 다른 동행 | `colors.line.default` | `colors.text.strong` |

얼굴 글자는 이름 첫 글자, `typography.bodyBold`(36 얼굴) 또는 `typography.captionBold`(24 얼굴).

## 아이콘

| 쓰는 곳 | 아이콘 |
| --- | --- |
| 뒤로·닫기·더하기·체크·사람·여행 | 공통 `Icon` (`back` `close` `plus` `check` `people` `trip`) |
| 낸 사람 앞 카드 | [assets/icon-card.svg](assets/icon-card.svg) — 공통 아이콘에 없음 |
| 정산 계산 버튼 | [assets/icon-calculator.svg](assets/icon-calculator.svg) — 공통 아이콘에 없음 |
| 다시 계산·정산 후 변경 안내 | 새로고침 아이콘 — 공통 아이콘에 없음, 필요하면 추가 |

## 공통 부품과 맞지 않는 점

- 글자 13/20 보통 굵기(나눌 사람 안내)는 글자 토큰에 없다. `typography.caption`(12/20)으로 쓸지, 토큰을 추가할지 정해야 한다.
- 둥글기 14(금액 입력 상자)는 토큰에 없다. 가까운 값은 `radius.md`(12), `radius.lg`(16).
- 입력 상자가 회색 바탕 상자 모양이라, 공통 `TextField`(밑줄 입력칸)와 모양이 다르다.
- 지출 저장 실패 상태에서는 마지막 섹션 이름이 "메모"로 되어 있고 기본 지출 추가는 "항목 이름"이다. 피그마 확인이 필요하다.

## 예시 데이터

피그마의 예시 이름은 문서에서 지우(나)·서연·민준으로 바꿨다. 금액은 피그마 그대로다.

| 지출 | 낸 사람 | 나눌 사람 | 금액 |
| --- | --- | --- | --- |
| 숙소 1박 | 지우(나) | 3명 똑같이 | 180,000원 |
| 서면 돼지국밥집 | 민준 | 3명 똑같이 | 33,000원 |
| 광안리 바다뷰 카페 | 서연 | 서연, 지우 2명 | 21,000원 |
| (정산 후 추가) 부산역 가는 택시 | 민준 | 3명 똑같이 | 12,000원 |

## 그 밖의 상태

- **지출 없음** — 합계·목록·정산 버튼 없이 [README 상태 공통 모양](README.md#상태-공통-모양)의 **가운데 안내 화면**(좌우 40): 카드 아이콘, "아직 입력한 지출이 없어요", "함께 쓴 돈을 넣으면 나눠 계산해요", 주 버튼 [더하기 + "지출 추가"]. 상단 바 [+]는 그대로
- **정산 후 지출 변경** — 합계 상자 위(간격 20)에 [README 상태 공통 모양](README.md#상태-공통-모양)의 **진행 상자(연파랑)** 변형: 새로고침 아이콘, "정산한 뒤에 지출이 바뀌었어요"(설명 줄 없음), 상자 오른쪽 아래 글자 링크 "이전 정산 보기" `typography.captionMedium` `colors.brand.primaryDark` + `Icon chevron-right` 14 → S36 재계산 필요. 합계 "246,000원"(만 원 줄임 없이 원 단위). 정산 뒤 추가된 지출 줄은 이름 옆에 연파랑 태그 "정산 후 추가"(`Tag tone="brand"`, 높이 20·좌우 6으로 조금 작음). 아래 버튼 [새로고침 + "다시 계산"]
- **지출 저장 실패** — 지출 추가 화면 맨 위(금액 위, 간격 28)에 [README 상태 공통 모양](README.md#상태-공통-모양)의 **안내 상자(회색)**: "지출을 저장하지 못했어요" + "저장하지 못했어요. 다시 눌러 주세요". 입력값 그대로, 아래 버튼 [다시 저장]. 이 상태의 마지막 칸 이름은 "메모"다(기본 지출 추가는 "항목 이름") — 피그마 통일 필요

## 버튼과 이동

[사용자 흐름](../../flow/user-flow.md) 기준. 누르는 것마다 어디로 가는지와 어떤 API를 부르는지.

| 누르는 것 | 어디서 | 동작·이동 |
| --- | --- | --- |
| [뒤로] | 상단 바 | S17 |
| [+] 상단 아이콘 / 빈 화면 [지출 추가] | 기본 · 지출 없음 | 지출 추가 화면 |
| 지출 줄 | 기본 | 내가 등록한 지출이면 수정 화면(지출 추가와 같은 모양, 아래에 [삭제] 추가). 남이 등록한 지출이면 보기만 |
| [정산 계산] | 기본 | `POST /trips/{tripId}/settlements`(본문 `expectedExpenseVersion`, 헤더 `Idempotency-Key` 필수) → S36 |
| [다시 계산] | 정산 후 지출 변경 | 같은 API(새 `expectedExpenseVersion`) → S36 |
| [이전 정산 보기] | 정산 후 지출 변경 | S36 재계산 필요 상태 |
| [닫기] | 지출 추가 상단 바 | 입력 버리고 S35로 |
| 낸 사람 칩 | 지출 추가 | 한 명 고르기 |
| 나눌 사람 칩 | 지출 추가 | 여러 명 고르기·해제. 0명이면 [저장] 불가 |
| [저장] | 지출 추가 | `POST /trips/{tripId}/expenses`(헤더 `Idempotency-Key` 필수) · 수정이면 `PATCH /trips/{tripId}/expenses/{expenseId}`(본문 `expectedVersion` 필수) → S35로, 목록·합계 갱신. 금액 0·이름 없음이면 누를 수 없음 |
| [다시 저장] | 지출 저장 실패 | 같은 입력 다시 보냄 |
| [삭제] | 지출 수정(내 지출) | S50 확인 시트(`ConfirmSheet`, "지출 삭제" 상태)에서 확인 → `DELETE /trips/{tripId}/expenses/{expenseId}?expectedVersion=…` → S35로, 목록·합계 갱신. 지우면 이전 정산이 무효가 되어 "정산 후 지출 변경" 상태가 된다. (화면 목록 S50 진입에 S35가 있는 대로, 2026-11-04 정함) |
