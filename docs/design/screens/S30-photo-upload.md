# S30 사진 선택·업로드

담당 B · 시연 핵심 · 요구사항 WD-FR-19 · 여는 곳 S17, S31 [사진 올리기]

화면 규칙은 [화면 목록](../../flow/screen-list.md) S30 줄: 사진 선택(JPG·PNG·HEIC, 한 번에 최대 50장), 업로드 진행. 시연은 안드로이드만이라 HEIC 변환은 뒤로 미뤄도 된다.

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 사진 선택 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-16782) | 아래 "사진 선택" 그대로 |
| 사진 권한 거절 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-16998) | 가운데 빈 화면: "사진에 접근할 수 없어요", "설정에서 사진 접근을 허용해 주세요", 주 버튼 [설정으로 이동], 글자 버튼 [나중에] |
| 업로드 진행 중 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17057) | 진행 표시 "20장 중 12장 올렸어요", "다 올리면 주제와 장소별로 나눠요", "취소해도 이미 올린 사진은 남아요", 글자 버튼 [올리기 취소] |
| 일부 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17208) | "2장을 올리지 못했어요", "18장은 올라갔어요", 실패한 사진 칸에 "실패" 표시, 안내 "실패한 2장만 다시 올려요", 글자 버튼 [나중에], 주 버튼 [2장 다시 시도] |

## 사진 선택

1. **상단 바** — [뒤로], 제목 "사진 올리기" `typography.bodyBold` + 가방 아이콘 16 "겨울 여행" `typography.caption`
2. **본문** — 위 16, 좌우 20, 간격 18
   - **보기 범위 칩**(가로 스크롤, 간격 10): 알약 높이 36, 좌우 14, 안 간격 8. 고른 칩 "여행 기간 사진 24"(배경 `colors.brand.primaryLight`, 글자 `typography.bodyMedium` + 숫자 `typography.captionMedium` 모두 `colors.brand.primaryDark`), 안 고른 칩 "모든 사진"(배경 `colors.surface.default`, `colors.text.icon`). 공통 `Chip`과 숫자 표시 차이만 있다
   - 안내: 정보 아이콘 16 + "여행 기간 사진만 보여요" `typography.caption` `colors.text.icon`
   - **날짜 묶음**(묶음 사이 간격 18, 제목과 격자 12): 왼쪽 "11.14(토)" `typography.title3`, 오른쪽 "14장 중 12장" `typography.caption` `colors.text.icon`
   - **사진 격자**: 4열, 칸 83x84, 둥글기 `radius.md`(12), 사진 없으면 `colors.line.default`. 고른 사진은 위에 `colors.text.default` 반투명 막 + 오른쪽 위 흰 동그라미 24 안에 체크 14. 안 고른 사진은 흰 테두리 동그라미 24만
3. **아래 줄** — 위 12·아래 34, 좌우 20. 왼쪽 "20장 선택" `typography.bodyBold`, 오른쪽 알약 주 버튼 48: 올리기 아이콘 20 + "올리기"

## 공통 부품과 맞지 않는 점

- 사진 고르기 칸(체크 동그라미, 어두운 막)은 S30·S32·S31 장소 미지정에서 같이 쓴다. B 기능 폴더에 **사진 칸** 부품을 하나 두면 좋다.
- 칩 안 숫자 표시는 공통 `Chip`에 없다(`label`에 숫자까지 넣거나 `count`를 추가).
