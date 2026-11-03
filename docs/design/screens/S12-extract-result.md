# S12 추출 결과 확인

담당 B · 시연 핵심 · 요구사항 WD-FR-05 · API: AI 장소 추출(작업 조회 `GET /jobs/{jobId}`), 결과 4종 `SUCCESS` `MULTIPLE_CANDIDATES` `NOT_FOUND` `FAILED`

화면 규칙은 [화면 목록](../../flow/screen-list.md) S12 줄: 진행 상태, 지도 핀 + 장소명·지역·키워드, 한 링크에서 찾은 여러 장소를 골라 저장, 수정·제거.

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 진행 중 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6645) | 지도 없이 가운데: "장소를 찾고 있어요", "보통 10초 안에 끝나요", 단계 3개 "링크와 캡처 읽기 / 장소 이름 찾기 / 지도에 표시하기"(지금 단계 강조), 글자 버튼 [취소] |
| 성공 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6941) | 아래 "성공" 그대로 |
| 복수 후보 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6727) | 지도 핀이 A·B·C 글자. 시트 제목 "어느 곳인가요?", 설명 "같은 이름이 3곳 있어요", 후보 줄 A·B·C(이름 + 주소 "부산 수영구 남천동"). 아래 글자 버튼 "여기에 없어요"(→ S13), 주 버튼 "이곳으로" |
| 식별 불가 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6847) | 가운데 빈 화면: "장소를 알아내지 못했어요", "장소를 찾지 못했어요. 직접 골라 주세요", 주 버튼 "장소 직접 검색하기"(→ S13) |
| 처리 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6894) | 가운데 오류 화면: "링크를 열지 못했어요", "불러오지 못했어요", 주 버튼 "다시 시도". 공통 `ErrorState` |
| 그룹 즐겨찾기에서 시작 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7617) | 성공과 같고 설명이 "겨울 여행 그룹 즐겨찾기에서 시작했어요", 주 버튼이 "겨울 여행 그룹에 저장"(저장 시트 없이 바로 저장) |

## 성공

화면 전체가 지도이고 그 위에 요소가 겹친다.

1. **상단 바** — 흰 배경, [뒤로] + 큰 제목 "찾은 장소" `typography.title1`
2. **원본 요약 칩** — 지도 위 가운데 떠 있는 흰 알약(높이 36, 좌우 12, 간격 14): [링크 아이콘 16 + "sns.example.com/p/8Kd2"] [사진 아이콘 16 + "2장"] `typography.caption` `colors.text.default`
3. **지도 핀** — 번호 동그라미 24(`colors.brand.primary`, 숫자 `typography.label` 흰색) + 옆에 흰 알약 이름표(높이 24, 좌우 10, 12/24 보통 `colors.text.default`). **지도 공통 부품(A)**의 마커를 쓴다
4. **아래 시트** — 흰 배경, 좌우 20·아래 34, 손잡이 36x4 `colors.gray[300]`
   - 제목 "장소 2곳을 찾았어요" `typography.title1`, 간격 2, "확인하고 저장해 주세요" `typography.caption` `colors.text.icon`
   - 장소 줄(위 여백 20, 줄 사이 24, 줄 안 간격 18): 번호 동그라미 24 · 가운데(세로 간격 8) · 오른쪽 동그라미 버튼 36 두 개(배경 `colors.surface.default`, 연필 / X 아이콘 18, 간격 10)
     - 이름 `typography.bodyBold`
     - [핀 아이콘 16 + "부산 수영구" `typography.caption` `colors.text.icon`] 다음 키워드 칩(높이 24, 좌우 8, 둥글기 `radius.sm`(8), 배경 `colors.surface.default`, 12/24 보통 `colors.text.icon`), 간격 10
     - 찾은 근거 [반짝임 아이콘 16 + "게시물 글에서 찾았어요"] `typography.caption` `colors.brand.primaryDark`
   - 아래 오른쪽 알약 주 버튼 48: 저장 아이콘 20 + "2곳" → S08 가져온 장소

## 공통 부품과 맞지 않는 점

- 글자 12/24 보통(지도 이름표, 키워드 칩)은 토큰에 없다. 가까운 것은 `typography.captionMedium`(12/20).
- 키워드 칩은 공통 `Chip`(알약)과 모양이 달라 둥글기 8의 작은 태그다. 여러 화면(S12, S14)에 나와서 공통 **태그**로 만드는 게 좋다.
- 진행 단계 표시는 공통 부품에 없다.
