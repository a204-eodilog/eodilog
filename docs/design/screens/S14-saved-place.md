# S14 저장 장소 상세

담당 B · 완성도 · 요구사항 WD-FR-06 · 여는 곳 S10

화면 규칙은 [화면 목록](../../flow/screen-list.md) S14 줄: 장소 정보, 메모 수정, 저장 해제, 그룹 즐겨찾기에 추가(여행 선택), 원본 공동 피드 열기. 원본이 지워지면 이름·위치·메모만 남는다.

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 기본 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7248) | 아래 "기본" 그대로 |
| 원본 공동 피드 삭제·볼 수 없음 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7347) | 아래 "그 밖의 상태" 참고 |
| 그룹 즐겨찾기에 추가 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7447) | 아래 "그룹 즐겨찾기에 추가 (시트)" 참고 |
| 그룹에 추가 · 참여 중인 여행 없음 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-5108) | 아래 "그 밖의 상태" 참고 |

## 기본

1. **상단 바** — [뒤로], 오른쪽 [저장 해제](채워진 북마크 아이콘 24). 해제하면 S50 확인 없이 토스트로 되돌리기를 줄지 정해야 함
2. **본문** — 위 16, 좌우 20, 섹션 사이 28
   1. **사진** — 350x196, 둥글기 `radius.lg`(16), 사진이 없으면 배경 `colors.line.default`
   2. **이름과 정보** — 세로 간격 12. "강문 해변" `typography.title1`; [핀 아이콘 16 + "강릉 강문동"] [자물쇠 아이콘 16 + "나만 봐요"] `typography.caption` `colors.text.icon`, 간격 14; 키워드 태그(S12와 같은 둥글기 8 태그, 간격 6)
   3. **내 메모** — 이름 줄(연필 아이콘 16 + "내 메모" `typography.captionMedium` `colors.text.icon`), 간격 12. 상자 배경 `colors.surface.default`, 둥글기 12, 안쪽 14/8/14/18: 메모 `typography.body` + 오른쪽 동그라미 버튼 36(연필 18) = 메모 고치기
   4. **가져온 곳** — 이름 줄(링크 아이콘 16 + "가져온 곳"), 간격 12. 누르는 줄: 배경 `colors.surface.default`, 둥글기 `radius.lg`, 안쪽 14/18/14/14, 간격 18. 얼굴 40 · 여행 이름 `typography.bodyBold` + [여행 아이콘 16 + "민준의 여행" `typography.caption`] · 오른쪽 `Icon chevron-right` 20. 누르면 S07
3. **아래 버튼** — 오른쪽 알약 주 버튼 48: 더하기 아이콘 20 + "그룹에 추가"

## 그룹 즐겨찾기에 추가 (시트)

기본 화면 위에 어두운 막(`colors.overlay`)과 아래 시트. 공통 `BottomSheet`로 만든다. 좌우 20·아래 34.

1. **제목 줄** — "어느 여행에 추가할까요?" `typography.title1`, 간격 2, [핀 아이콘 16 + 장소 이름 `typography.caption` `colors.text.icon`]. 오른쪽 [닫기] 24(누르는 영역 44)
2. **여행 목록** — 위 16, 줄 사이 10. 줄은 [S08 담을 여행](S08-place-save-sheet.md#기본)과 같다: 높이 80, 안쪽 16/20, 둥글기 16, 고른 줄 `colors.brand.primaryBg`, 이름 `typography.bodyBold`, [달력 16 + 기간] [사람 16 + 동행 이름] `typography.caption`, 오른쪽 라디오 22
   - 참여 중인 여행이 없으면 이 자리에 "아직 내 여행이 없어요⏎여행을 만들면 여기에 담을 수 있어요" `typography.body` `colors.text.sub` 가운데 정렬, [추가] 누를 수 없음
3. 안내: 자물쇠 아이콘 16 + "고른 여행의 동행만 볼 수 있어요" `typography.caption` `colors.text.icon`
4. **버튼** — 위 20, 오른쪽 알약 주 버튼 48 [더하기 아이콘 20 + "추가"]

S08의 여행 목록 부분을 따로 떼어 두면 여기서 그대로 쓴다.

## 공통 부품과 맞지 않는 점

- 키워드 태그(둥글기 8)는 S12와 같다. 공통으로 만들면 함께 쓴다.
- 여행 고르는 시트는 S08 "담을 여행"과 같은 모양이다. S08을 만들 때 여행 목록 부분을 따로 떼어 두면 여기서 다시 쓸 수 있다.

## 그 밖의 상태

- **원본 공동 피드 삭제·볼 수 없음** — 사진 자리에 작은 지도(높이 140, 둥글기 16, 핀 하나)로 위치만 보여 줌. 키워드 태그 없음. "가져온 곳" 줄이 누를 수 없는 회색 줄(높이 68, 안쪽 14/18/14/14): 흰 동그라미 40 안에 끊긴 링크 아이콘 20 + "원본을 더 볼 수 없어요" `typography.body` `colors.text.icon`. 아래 [그룹에 추가]는 그대로
- **그룹에 추가 · 참여 중인 여행 없음** — 시트 안 여행 목록 자리에 여행 아이콘 16 + "아직 내 여행이 없어요⏎여행을 만들면 여기에 담을 수 있어요" `typography.caption` `colors.text.icon`(간격 4). [추가] 버튼 줄은 흐림 0.40으로 누를 수 없음. 피그마는 글자 크기가 12/18·16/24로 그려져 있으나 토큰으로 맞춘다

## 버튼과 이동

[사용자 흐름](../../flow/user-flow.md) 기준. 누르는 것마다 어디로 가는지와 어떤 API를 부르는지.

| 누르는 것 | 어디서 | 동작·이동 |
| --- | --- | --- |
| [뒤로] | 상단 바 | S10 |
| [저장 해제] 북마크 | 상단 바 | `DELETE /me/bookmarks/{placeId}` → S10으로 돌아가며 토스트 "저장을 해제했어요" + [되돌리기] |
| 메모 상자 [연필] | 내 메모 | 메모 고치기(인라인 또는 시트) → `PATCH /me/bookmarks/{placeId}` |
| 가져온 곳 줄 | 기본 | S07 친구 여행 상세(A). 원본을 볼 수 없으면 누를 수 없음 |
| [그룹에 추가] | 아래 버튼 | 그룹 즐겨찾기에 추가 시트 |
| 시트 여행 줄 | 그룹에 추가 시트 | 여행 하나 고르기 |
| 시트 [추가] | 그룹에 추가 시트 | `PUT /trips/{tripId}/saved-places/{placeId}/me` → 시트 닫고 토스트 "OO 여행에 담았어요" + [보기](→ S20) |
| 시트 [닫기] | 그룹에 추가 시트 | 시트만 닫음 |
