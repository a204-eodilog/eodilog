# S32 사진 분류·묶음 수정

담당 B · 완성도 · 요구사항 WD-FR-20 · 여는 곳 S31 묶음 칸

화면 규칙은 [화면 목록](../../flow/screen-list.md) S32 줄: 주제 변경, 묶음 분리, 장소·여행 연결 보정, 삭제(→ S50 사진).

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 기본 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17941) | 아래 "기본" 그대로 |
| 바꾸기 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-30627) | 기본 + 오류 문구 "묶음을 바꾸지 못했어요" + [다시 시도]. 고른 사진과 값은 그대로 |

## 기본

1. **상단 바** — [뒤로], 제목 "묶음 수정" `typography.bodyBold` + "겨울 여행" `typography.caption`, 오른쪽 글자 버튼 "완료" `typography.bodyMedium` `colors.brand.primaryDark`
2. **본문** — 위 16, 좌우 20, 간격 14
   1. **묶음 머리** — 왼쪽 "해운대 해변 묶음 6장" `typography.title3`, 아래 얼굴 20 + "지우가 올렸어요" `typography.caption` `colors.text.icon`(간격 8). 오른쪽 "2장 선택" `typography.captionMedium` `colors.brand.primaryDark`
   2. **사진 격자** — 3열, 칸 111x104, 둥글기 12. 고르기 표시는 [S30 사진 격자](S30-photo-upload.md#사진-선택)와 같다. 대표 사진 왼쪽 위에 검은 알약 "대표"(높이 22, 좌우 7, 12/22 보통 흰색)
   3. **고른 사진 바꾸기 상자** — 배경 `colors.surface.default`, 둥글기 `radius.xl`(20), 안쪽 16/20, 줄 간격 8
      - 제목 "고른 2장 바꾸기" `typography.captionMedium` `colors.brand.primaryDark`
      - 줄 3개(높이 40, 간격 14): 왼쪽 이름표(아이콘 16 + "주제/장소/여행" `typography.captionMedium` `colors.text.icon`, 폭 64)
        - 주제: 작은 칩 높이 32, 좌우 12 "풍경/음식/사람/기타"(고른 칩 `colors.brand.primaryLight`)
        - 장소·여행: 지금 값 `typography.body` + 오른쪽 흰 알약 버튼 "바꾸기"(높이 32, 좌우 12, `typography.captionMedium`)
   4. 안내: 정보 아이콘 16 + "원본은 지우지 않아요" `typography.caption` `colors.text.icon`
3. **아래 버튼 두 개** — 위 12·아래 34, 간격 10. 회색 알약 48 "묶음에서 빼기"(배경 `colors.surface.default`, 글자 `colors.text.default`), 빨간 알약 48 "삭제"(공통 `Button variant="danger"`) → S50 사진 삭제 확인

## 공통 부품과 맞지 않는 점

- 글자 12/22 보통("대표" 배지)은 토큰에 없다.
- 회색 알약 버튼은 공통 `Button variant="neutral"`인데, 피그마는 글자색이 `colors.text.default`, 공통은 `colors.text.icon`이다.
