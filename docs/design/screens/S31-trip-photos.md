# S31 여행 사진 목록

담당 B · 시연 핵심 · 요구사항 WD-FR-19, 20 · 여는 곳 S17, S30

화면 규칙은 [화면 목록](../../flow/screen-list.md) S31 줄: 주제별 분류, 비슷한 사진 묶음, 올린 사람, 연결된 장소, [공동 피드 게시]. 장소 미지정 묶음이 따로 있다.

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 기본 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17384) | 아래 "기본" 그대로 |
| 분류 중 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17604) | 칩 아래 안내 "사진을 주제별로 나누고 있어요", "32장 중 20장 나눴어요 · 끝나면 묶음이 보여요". 장소 묶음 대신 "올린 순서" 제목과 "아직 나누지 않았어요" 사진 격자(올린 사람 얼굴만) |
| 사진 없음 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17738) | 가운데 빈 화면: "아직 올린 사진이 없어요", "사진을 올리면 장소별로 나눠요", 주 버튼 [사진 올리기] |
| 장소 미지정 묶음 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17795) | 별도 화면(제목 "장소 미지정"). "위치와 날짜가 없는 사진을 장소에 연결해요", 사진 3장 격자("3장 선택"), "어디서 찍었나요?" 아래 코스 장소 목록(일차별, 번호 + 이름), [장소 검색] "코스에 없는 곳이면 찾아서 연결해요", 주 버튼 [연결하기] |
| 자동 분류 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-30488) | 분류 중과 같고 안내가 "사진을 주제별로 나누지 못했어요" + [다시 시도] |

## 기본

1. **상단 바** — [뒤로], 제목 "사진" `typography.bodyBold` + "겨울 여행" `typography.caption`, 오른쪽 [사진 올리기](더하기 사진 아이콘 24) → S30
2. **본문** — 위 16, 좌우 20, 간격 24
   1. **주제 칩**(가로 스크롤, 간격 10): "전체 32 / 풍경 14 / 음식 9 / 사람 6 / 기타 3". 모양은 [S30 칩](S30-photo-upload.md#사진-선택)과 같다
   2. **장소 미지정 안내 줄** — 상자 배경 연회색(피그마 변수 `color/grey/98 2`, `colors.surface.subtle`로 맞추면 됨), 둥글기 `radius.lg`, 안쪽 16, 간격 14. 왼쪽에 사진 40x40 세 장을 12씩 겹쳐 놓음(둥글기 10) · "장소 미지정 3장" `typography.bodyBold` + "위치와 날짜 정보가 없어요" `typography.caption` `colors.text.icon` · 오른쪽 "연결하기" `typography.captionMedium` `colors.brand.primaryDark` + `Icon chevron-right` 14. 누르면 장소 미지정 묶음 화면
   3. **장소별 묶음**(섹션 간격 24, 제목과 격자 12)
      - 제목 줄: 핀 아이콘 18 + 장소 이름 `typography.title3` + 오른쪽 "1일차, 9장" `typography.caption` `colors.text.icon`
      - 칸 3개 가로(111x112, 둥글기 12)
        - 묶음 칸: 왼쪽 아래 검은 알약(`colors.text.default`, 높이 22, 좌우 5/7) 안에 겹친 사진 아이콘 14 + 장수 "6" `typography.captionMedium` 흰색
        - 오른쪽 아래 올린 사람 얼굴 22(`typography.captionBold`). **나**는 `colors.brand.primaryLight` 배경, 다른 동행은 `colors.line.default` ([S35 얼굴 모양](S35-expenses.md#얼굴-모양))
      - 칸을 누르면 묶음이면 S32, 한 장이면 사진 크게 보기
3. **아래 줄** — 왼쪽 "사진 32장 · 3명이 올렸어요" `typography.caption` `colors.text.icon`, 오른쪽 알약 주 버튼 48 "공동 피드 게시"(게시 아이콘 20) → S38

## 예시 데이터

해운대 해변(1일차, 9장: 지우 6장 묶음, 서연 1장, 민준 2장 묶음), 서면 돼지국밥집(1일차, 6장), 감천문화마을(2일차 · 14장). 제목 줄 표기가 "1일차, 9장"과 "2일차 · 14장"으로 섞여 있어 하나로 맞춰야 한다.
