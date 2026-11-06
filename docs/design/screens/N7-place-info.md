# N7 장소 정보 시트

담당 A · 완성도 · 요구사항 WD-FR-10 · S05 추천 장소, S07 장소 줄, N3 대표 장소에서 연다

구현 `frontend/src/features/place`(`PlaceInfoSheet`, 공개 파일 `index.ts`), 미리보기 `/dev/place-info?state=basic|loading|error`.

| 상태          | 피그마                                                                                | 이번에 만듦                  |
| ------------- | ------------------------------------------------------------------------------------- | ---------------------------- |
| 기본          | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-5305)  | 예                           |
| 불러오기 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-27033) | 예(시트 안 안내 + 다시 시도) |

- 제목(장소 이름) + 주소, 사진 자리(160, 사진이 없어 아이콘)
- ♡ 들어온 곳이 알려 준 이유(홈 추천이면 "좋아요한 여행과 비슷해요")
- 다녀간 친구 "가람이 다녀왔어요" / "가람 외 2명이 다녀왔어요"(이/가는 받침으로)
- ★ 평균 점수 + 가장 먼저 쓴 한 줄 평가
- [저장](오른쪽 아래 파란 동그라미): 눌러야 저장(결정 F-23). N7을 닫고 S08 장소 저장 시트(B)를 연다

값: `GET /places/{placeId}`, `/social-summary`(다녀간 친구·평균), `/public-reviews`(한 줄 평가). 요약이나 평가를 못 받으면 그 줄만 뺀다(`info.toPlaceInfo`).

## 백엔드에 필요한 것

1. `Place`에 사진이 없다. 공공 장소 자료(관광공사)에 대표 사진이 있으면 주소를 같이 주면 좋다
2. 다녀간 친구 목록 화면이 정해지지 않았다(줄을 누르면 지금은 아무 일 없음)
