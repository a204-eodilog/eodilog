# N3 여행지 정보

담당 A · 확장 · 요구사항 WD-FR-11 · S09에서 들어온다

구현 `frontend/src/features/destination`, 주소 `/regions/[regionId]`, 미리보기 `/dev/destination?state=basic|loading|error`.

| 상태          | 피그마                                                                                | 이번에 만듦                         |
| ------------- | ------------------------------------------------------------------------------------- | ----------------------------------- |
| 기본          | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-5211)  | 예(사진 넘기기 대신 사진 자리 하나) |
| 불러오기 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-28309) | 예                                  |

- 머리: 지역 이름. 사진 자리(180), 지역 이름(`title1`) + 📍 상위 시도 + 소개 한 줄
- **대표 장소**: 사진 자리 56 + 이름 + 주소, 오른쪽 [저장](S08 장소 저장 시트). 줄을 누르면 N7 장소 정보 시트
- 오른쪽 아래 [+ 새 여행] → S16 `/trips/new?regionId=` (이 여행지를 넣은 채, 결정 F-23)

값: `GET /regions/{regionId}`(RegionDetail). 명세상 `introduction`·`representativePlaces`가 아직 비어 올 수 있어, 비면 소개 줄을 빼고 "아직 소개할 장소가 없어요".

## 백엔드에 필요한 것

1. `RegionDetail`에 지역 사진이 없다(Figma는 여러 장을 넘겨 봄)
2. 대표 장소의 분류("해변", "카페")가 `Place`에 없어 주소를 대신 보인다
3. `introduction`·`representativePlaces`를 채울 출처(공공 장소 자료?)가 정해지지 않았다
