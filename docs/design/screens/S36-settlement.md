# S36 정산 결과

담당 B · 시연 단계 완성도 · 요구사항 WD-FR-23 · API `GET /trips/{tripId}/settlement`, `POST/GET /trips/{tripId}/settlements` ([명세](../../api-spec.md))

화면 규칙은 [화면 목록](../../flow/screen-list.md) S36 줄을 따른다: 구성원별 부담액, 누가 누구에게 얼마, 포함한 지출·분담 기준. 완료 표시는 없다.

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 기본 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-19618) | 아래 "기본 화면" 그대로 |
| 재계산 필요 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-19859) | 아래 "재계산 필요" 참고 |
| 계산 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31138) | 아래 "계산 실패" 참고 |

## 기본 화면

위에서 아래로. 화면 좌우 여백 `layout.screenPaddingX`(20), 섹션 사이 간격 28.

1. **상단 바** `Header` — 높이 56, 왼쪽 [뒤로], 제목 "정산 결과" `typography.bodyBold`, 아래 가방 아이콘 16 + "겨울 여행" `typography.caption`. 오른쪽에 동행 얼굴 묶음(24 얼굴, 6씩 겹침, 흰 테두리 2) = 공통 `AvatarGroup`
2. **요약** — 위 여백 16, 줄 간격 2
   - "234,000원을 3명이 나눴어요" `typography.title1` `colors.text.default`
   - 시계 아이콘 16 + "11.16(월) 21:10 계산" `typography.caption` `colors.text.icon`, 간격 6
3. **누가 누구에게 얼마** — 제목 `typography.title3`, 제목·목록·안내 간격 10
   - 한 줄: 배경 `colors.surface.default`, 둥글기 `radius.lg`(16), 안쪽 여백 위아래 16·좌우 18, 줄 사이 10
   - 왼쪽 "민준 → 지우" `typography.body`, 오른쪽 "38,000원" `typography.bodyBold`
   - 목록 아래 안내: 정보 아이콘 16 + "송금은 각자 해요" `typography.caption` `colors.text.icon`, 간격 8
4. **구성원별 부담액** — 제목 `typography.title3`, 제목과 목록 12, 줄 사이 8, 한 줄 최소 높이 56, 줄 안 간격 14
   - 얼굴 36 · 가운데: 이름 `typography.bodyBold`, 아래 [카드 아이콘 + "낸 돈 180,000원"] [사람 아이콘 + "부담 81,500원"] `typography.caption` `colors.text.icon`, 묶음 간격 12
   - 오른쪽 위아래 두 줄, 오른쪽 정렬: 금액 `typography.bodyBold`, 아래 "받아요" 또는 "보내요" `typography.caption`
   - **받는 사람**은 금액과 "받아요" 모두 `colors.brand.primaryDark`. 보내는 사람은 금액 `colors.text.default`, "보내요" `colors.text.icon`
5. **포함한 지출** — 상자 배경 `colors.surface.default`, 둥글기 `radius.xl`(20), 안쪽 여백 18, 안 간격 6
   - 제목 줄: 왼쪽 "포함한 지출 3건" `typography.title3`, 오른쪽 "합계 234,000원" `typography.caption` `colors.text.icon`
   - 지출 줄(최소 높이 44, 줄 사이 12): 이름 `typography.body`, 아래 "지우가 냄 · 3명이 똑같이" `typography.caption` `colors.text.icon`, 오른쪽 금액 `typography.bodyMedium`
   - 맨 아래 위 여백 4: 계산기 아이콘 16 + "1명 금액은 10원 단위로 올려 계산했어요" `typography.caption` `colors.text.default`

화면이 길어서(피그마 높이 1040) 세로 스크롤이다. 아래 고정 버튼은 없다.

## 얼굴 모양

[S35 얼굴 모양](S35-expenses.md#얼굴-모양)과 같다. 나는 연파랑, 다른 동행은 회색.

## 아이콘

| 쓰는 곳 | 아이콘 |
| --- | --- |
| 뒤로·사람·여행 | 공통 `Icon` (`back` `people` `trip`) |
| 계산 시각 | [assets/icon-clock.svg](assets/icon-clock.svg) — 공통 아이콘에 없음 |
| 송금은 각자 해요 | [assets/icon-info.svg](assets/icon-info.svg) — 공통 아이콘에 없음(`alert`는 세모 모양) |
| 낸 돈 | [assets/icon-card.svg](assets/icon-card.svg) |
| 10원 단위 안내, 계산 실패 | [assets/icon-calculator.svg](assets/icon-calculator.svg) — 파일은 흰 선이라 회색으로 바꿔 쓴다 |
| 다시 계산 | 새로고침 아이콘 — 공통 아이콘에 없음 |

## 재계산 필요

기본 화면 위에 안내 상자가 붙고, 이전 결과 전체가 흐림 0.48로 보인다. "포함한 지출" 상자는 없다.

1. **안내 상자** — 위 4, 배경 `colors.brand.primaryBg`, 둥글기 `radius.xl`(20), 안쪽 20, 세로 간격 12
   - 줄(간격 14): 흰 동그라미 44 안에 새로고침 아이콘 22 · "다시 계산해야 해요" `typography.bodyBold` + "정산 뒤 택시 12,000원이 추가됐어요" `typography.caption` `colors.text.icon`
   - 오른쪽 정렬 알약 주 버튼 40(좌우 12/16, 새로고침 아이콘 16 + "다시 계산" `typography.bodyMedium` 흰색). 누르면 `POST /trips/{tripId}/settlements`
2. **이전 정산**(흐림 0.48, 세로 간격 28)
   - 회색 태그 "이전 정산 · 지금과 달라요"(배경 `colors.line.default`, 둥글기 8, 좌우 8, `typography.captionMedium` `colors.text.default`)
   - 요약 "234,000원을 3명이 나눴어요" + 계산 시각 — 기본과 같음
   - "누가 누구에게 얼마" 줄이 조금 다르다: 높이 68, 안쪽 18/20. 왼쪽에 **보내는 사람 얼굴 32 → 화살표 아이콘 18 → 받는 사람 얼굴 32**(간격 6), 그다음 "민준 → 지우" `typography.body`, 오른쪽 금액 `typography.bodyBold`
   - "구성원별 부담액"은 기본과 같음
3. 이 상태에서는 "포함한 지출" 상자와 안내 "10원 단위" 줄이 없다

## 공통 부품과 맞지 않는 점

- "보내요/받아요" 금액 색, 나 얼굴 색처럼 "나" 기준 강조가 공통 `Avatar`에 없다.
- 계산 실패의 가운데 오류 화면은 공통 `ErrorState`로 만들 수 있지만, 그 아래 두 번째 글자 버튼("경비 목록 보기")을 넣는 자리가 지금은 없다.

## 예시 데이터

피그마의 예시 이름은 문서에서 지우(나)·서연·민준으로 바꿨다. 금액은 피그마 그대로다.

| 누가 | 낸 돈 | 부담 | 결과 |
| --- | --- | --- | --- |
| 지우(나) | 180,000원 | 81,500원 | 98,500원 받아요 |
| 민준 | 33,000원 | 71,000원 | 38,000원 보내요 |
| 서연 | 21,000원 | 81,500원 | 60,500원 보내요 |

보내기: 민준 → 지우 38,000원, 서연 → 지우 60,500원.

## 계산 실패

[README 상태 공통 모양](README.md#상태-공통-모양)의 **가운데 안내 화면**(좌우 36, 위 16): 계산기 아이콘, "정산을 계산하지 못했어요", "지출 3건은 그대로예요. 다시 계산해 주세요", 주 버튼 [새로고침 + "다시 계산"], 그 아래(간격 10) 글자 버튼 "경비 목록 보기" → S35. 상단 바(얼굴 묶음 포함)는 그대로

## 버튼과 이동

[사용자 흐름](../../flow/user-flow.md) 기준. 누르는 것마다 어디로 가는지와 어떤 API를 부르는지.

| 누르는 것 | 어디서 | 동작·이동 |
| --- | --- | --- |
| [뒤로] | 상단 바 | S35 |
| [다시 계산] | 재계산 필요 · 계산 실패 | `POST /trips/{tripId}/settlements`(본문 `expectedExpenseVersion`, 헤더 `Idempotency-Key` 필수) → 기본 상태 |
| [경비 목록 보기] | 계산 실패 | S35 |
| 누가 누구에게 얼마 줄 / 부담액 줄 | 기본 | 누르는 것 없음(정보만). 송금은 앱 밖 |
| 포함한 지출 줄 | 기본 | 누르는 것 없음. 지출을 고치려면 S35 |
