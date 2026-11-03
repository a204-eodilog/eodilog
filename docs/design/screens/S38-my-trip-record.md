# S38 내 여행 기록·공동 피드 게시

담당 B · 시연 핵심 · 요구사항 WD-FR-27, 28 · 여는 곳 S37 핀, N4, S41, S17, S31

화면 규칙은 [화면 목록](../../flow/screen-list.md) S38 줄: 사진·코스·평가·경비 요약, 공동 피드 상태, [공동 피드 게시](동행 누구나, 게시해야 생성) → 게시 확인(전체 공개 안내, 친구에게 보이는 모습 미리 보기), [내 노출 설정], [공동 피드 삭제], 장소 위치 변경·기록 삭제.

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 게시 전 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-21466) | 아래 "게시 전" 그대로 |
| 게시 확인 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-3339) | 아래 시트: "공동 피드를 게시할까요?", "겨울 여행 · 동행 3명의 기록", 안내 세 줄 "모두에게 공개돼요⏎사진·코스·평가·경비가 함께 올라가요⏎숨길 친구는 게시 후 고를 수 있어요", 글자 버튼 [친구에게 보이는 모습 미리 보기](→ S40), 주 버튼 [게시] |
| 게시됨 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-21588) | 상태 태그 "게시됨"(연파랑) + "전체 공개 · 하늘에게 숨김", 안내 "하늘님은 서연님 피드에서는 볼 수 있어요". 기록 관리에 [공동 피드 삭제] 추가, 아래 버튼이 [내 노출 설정](→ S39). 토스트 "공동 피드를 게시했어요" |
| 불러오기 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31377) | 공통 `ErrorState`: "여행 기록을 불러오지 못했어요", [다시 시도], [돌아가기] |

## 게시 전

1. **상단 바** — [뒤로] + 큰 제목 "내 여행 기록" `typography.title1`
2. **본문** — 위 16, 좌우 20, 간격 20
   1. **머리**(세로 10) — 회색 태그 "게시 전"([N4 태그](N4-my-trips.md#기본)), 여행 이름 `typography.title1`, 정보 줄(간격 12) [달력 16 + "11.14 – 11.15 · 1박 2일"] [사람 16 + "서연, 민준와 함께"] `typography.caption` `colors.text.icon`, 안내 "게시하면 모두에게 공개돼요" `typography.caption`
   2. **사진 카드** — 흰 바탕 테두리 카드, 둥글기 `radius.lg`(16), 안쪽 18/20, 세로 16. 머리 줄: 사진 아이콘 20 + "사진 32장" `typography.bodyBold` + "3명이 올렸어요" `typography.caption` + `Icon chevron-right` 16. 아래 썸네일 4개 73x52 둥글기 10. 누르면 S31
   3. **요약 카드 3개 가로**(각 110x136, 흰 바탕 테두리, 둥글기 16, 안쪽 16/18, 세로 6)
      - 이름 줄: 아이콘 18 + "코스/평가/경비" `typography.captionMedium` `colors.text.icon`
      - 값 `typography.bodyBold`: "4곳 다녀옴" / "내 평가 1개" / "23.4만 원"
      - 보조 `typography.caption`: "계획 5곳" / "해운대 4점" / "정산 계산됨"
      - 누르면 각각 S24 / S33 / S35
   4. **기록 관리** — 흰 알약 버튼 40(테두리, 좌우 10/14, 아이콘 16 + `typography.captionMedium`), 간격 10: "장소 위치 바꾸기"(`colors.text.default`), "기록 삭제"(`colors.status.danger`) → S50
3. **아래 버튼** — 오른쪽 알약 주 버튼 48: 게시 아이콘 20 + "공동 피드 게시" → 게시 확인 시트

## 공통 부품과 맞지 않는 점

- 흰 테두리 카드(사진 카드, 요약 카드)는 공통 부품에 없다. 테두리 색은 `colors.line.default`.
- 흰 테두리 알약 작은 버튼(40)은 공통 `Button`에 없다.
