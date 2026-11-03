# S33 방문 장소 평가 목록

담당 B · 완성도 · 요구사항 WD-FR-21 · 여는 곳 S17

화면 규칙은 [화면 목록](../../flow/screen-list.md) S33 줄: 사진으로 확인된 방문 후보, '다녀옴' 직접 체크, 내 평가 상태.

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 방문 후보 있음 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-18223) | 아래 "기본" 그대로 |
| 사진 없는 장소 직접 체크 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-18402) | 요약이 "다녀온 곳 4곳 중 1곳 평가했어요". 직접 고른 줄에 배지 "직접 체크함". 이미 평가한 줄은 버튼 자리에 내 점수 "4". 토스트 "다녀온 곳으로 표시했어요" + [되돌리기] |
| 방문 후보 없음 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-18587) | 위에 안내 "사진으로 찾은 방문 장소가 없어요", "다녀온 곳을 직접 체크해 주세요", [사진 올리기]. 모든 줄이 "계획에만 있어요" + [다녀옴] |
| 불러오기 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-30774) | 공통 `ErrorState`: "방문 장소를 불러오지 못했어요", "다시 시도해 주세요", [다시 시도] |

## 기본

1. **상단 바** — [뒤로], 제목 "평가" `typography.bodyBold` + "겨울 여행" `typography.caption`, 오른쪽 동행 얼굴 묶음 24(`AvatarGroup`, 나는 연파랑)
2. **본문** — 위 16, 좌우 20, 간격 14
   - 안내 "사진 위치와 날짜로 다녀온 곳을 찾아요" `typography.caption` `colors.text.sub2`
   - 요약 "사진으로 다녀온 곳 3곳을 찾았어요" `typography.bodyBold`
   - **일차 묶음**(제목과 목록 8, 줄 사이 8): 제목 "1일차 · 11.14(토)" `typography.captionMedium` `colors.text.icon`
   - **장소 줄**(간격 18): 번호 동그라미 28(다녀온 곳 `colors.brand.primary`, 계획에만 있는 곳 `colors.text.muted`, 숫자 `typography.captionBold` 흰색) · 가운데(세로 8): 시각 "10:00" `typography.captionMedium` `colors.text.icon`, 장소 이름 `typography.bodyBold`, 상태 줄 · 오른쪽 회색 알약 버튼 36(좌우 12/16, 아이콘 16 + 글자 `typography.bodyMedium` `colors.text.default`)
     - 사진으로 확인: 초록 태그(높이 24, 좌우 8, 둥글기 8, 배경 `colors.status.successBg2`, 체크 아이콘 14 + "사진으로 확인됨" `typography.captionMedium` `colors.status.success`) + "9장" `typography.caption` → 버튼 [별 아이콘 평가하기]
     - 계획에만 있음: 아이콘 14 + "계획에만 있어요" `typography.caption` `colors.text.sub` → 버튼 [체크 아이콘 다녀옴]
   - 맨 아래 안내: 정보 아이콘 16 + "다녀온 곳만 평가할 수 있어요" `typography.caption` `colors.text.icon`

## 공통 부품과 맞지 않는 점

- 초록 확인 태그는 S12·S14의 회색 키워드 태그와 같은 모양에 색만 다르다. 공통 **태그**에 색 종류를 두면 된다.
- 토스트에 [되돌리기] 버튼 자리가 필요하다(S08과 같은 요구).
