# S14 저장 장소 상세

담당 B · 완성도 · 요구사항 WD-FR-06 · 여는 곳 S10

화면 규칙은 [화면 목록](../../flow/screen-list.md) S14 줄: 장소 정보, 메모 수정, 저장 해제, 그룹 즐겨찾기에 추가(여행 선택), 원본 공동 피드 열기. 원본이 지워지면 이름·위치·메모만 남는다.

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 기본 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7248) | 아래 "기본" 그대로 |
| 원본 공동 피드 삭제·볼 수 없음 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7347) | "가져온 곳" 줄이 "원본을 더 볼 수 없어요"만 남고 누를 수 없음. 사진·키워드 자리 없음 |
| 그룹 즐겨찾기에 추가 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7447) | 아래 시트: "어느 여행에 추가할까요?" + 장소 이름, 여행 목록(S08 "담을 여행"과 같은 줄 모양), 안내 "고른 여행의 동행만 볼 수 있어요", 버튼 [추가] |
| 그룹에 추가 · 참여 중인 여행 없음 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-5108) | 시트의 여행 목록 자리에 "참여 중인 여행이 없어요⏎여행을 만들면 여기에 담을 수 있어요", [추가] 누를 수 없음 |

## 기본

1. **상단 바** — [뒤로], 오른쪽 [저장 해제](채워진 북마크 아이콘 24). 해제하면 S50 확인 없이 토스트로 되돌리기를 줄지 정해야 함
2. **본문** — 위 16, 좌우 20, 섹션 사이 28
   1. **사진** — 350x196, 둥글기 `radius.lg`(16), 사진이 없으면 배경 `colors.line.default`
   2. **이름과 정보** — 세로 간격 12. "강문 해변" `typography.title1`; [핀 아이콘 16 + "강릉 강문동"] [자물쇠 아이콘 16 + "나만 봐요"] `typography.caption` `colors.text.icon`, 간격 14; 키워드 태그(S12와 같은 둥글기 8 태그, 간격 6)
   3. **내 메모** — 이름 줄(연필 아이콘 16 + "내 메모" `typography.captionMedium` `colors.text.icon`), 간격 12. 상자 배경 `colors.surface.default`, 둥글기 12, 안쪽 14/8/14/18: 메모 `typography.body` + 오른쪽 동그라미 버튼 36(연필 18) = 메모 고치기
   4. **가져온 곳** — 이름 줄(링크 아이콘 16 + "가져온 곳"), 간격 12. 누르는 줄: 배경 `colors.surface.default`, 둥글기 `radius.lg`, 안쪽 14/18/14/14, 간격 18. 얼굴 40 · 여행 이름 `typography.bodyBold` + [여행 아이콘 16 + "민준의 여행" `typography.caption`] · 오른쪽 `Icon chevron-right` 20. 누르면 S07
3. **아래 버튼** — 오른쪽 알약 주 버튼 48: 더하기 아이콘 20 + "그룹에 추가"

## 공통 부품과 맞지 않는 점

- 키워드 태그(둥글기 8)는 S12와 같다. 공통으로 만들면 함께 쓴다.
- 여행 고르는 시트는 S08 "담을 여행"과 같은 모양이다. S08을 만들 때 여행 목록 부분을 따로 떼어 두면 여기서 다시 쓸 수 있다.
