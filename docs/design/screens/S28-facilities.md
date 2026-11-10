# S28 주변 편의시설

담당 A · 확장 · 요구사항 WD-FR-18 · S25 여행 중(C 담당)에서 기준 장소를 넘겨 연다

구현 `frontend/src/features/facility`, 주소 `/trips/[tripId]/facilities?placeId=`, 미리보기 `/dev/facilities?state=basic|error|empty|loading`.

| 상태      | 피그마                                                                                | 이번에 만듦 |
| --------- | ------------------------------------------------------------------------------------- | ----------- |
| 기본      | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-15586) | 예          |
| 조회 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-15776) | 예          |
| 결과 없음 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-15901) | 예          |

- 머리: "주변 편의시설" + 여행 이름 + 동행 얼굴
- 기준 장소 알약 "📍 기준 서면 돼지국밥 ↓"(바꾸기는 준비 중) + "2km 안"
- 시설 유형 칩(가로 스크롤): 전기차 충전소 · 주유소 · 화장실 · 약국 · 편의점
- 지도(200, **네이버 지도**): 기준 장소(점 위 이름) + 번호 동그라미. 기준 장소와 찾은 시설이 모두 들어오게 맞추고(최소 약 660m), 유형을 바꾸면 다시 맞춘다. 가까운 핀은 조금 벌린다. 웹 미리보기는 회색 상자
- 목록: 번호 + 이름 + 🚶 "도보 5분" + 확인된 상태(초록 ✓ "급속 2대 사용 가능 · 10:15 확인") 또는 ⓘ "운영 여부를 확인하지 못했어요", 오른쪽 길찾기(준비 중)
- 가까운(걷는 시간) 순. 조회 실패("편의시설을 불러오지 못했어요" + [다시 시도])와 빈 결과("2km 안에 주유소가 없어요" + [기준 장소 바꾸기], 지금은 준비 중)를 나눠 보인다

값: `GET /places/{placeId}/facilities?type&radiusMeters=2000`, 기준 장소 `GET /places/{placeId}`, 머리 `GET /trips/{tripId}`.

## 백엔드에 필요한 것 / 정한 것

1. 시설 종류 값과 반경(결정 Q-8)이 없어 `EV_CHARGER`·`GAS_STATION`·`TOILET`·`PHARMACY`·`CONVENIENCE_STORE`, 2km로 보냈다. 서버 값이 정해지면 `facility.FACILITY_TYPES`의 key만 바꾼다
2. 기준 장소 바꾸기(여행 일정의 장소 중 고르기)와 길찾기(네이버 지도 앱 열기)는 S25와 같이 정한다
3. 네이버 지도 키가 있는 개발 빌드에서만 지도가 보인다
