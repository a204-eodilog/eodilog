# S09 최근 트렌드 여행지

담당 A · 확장 · 요구사항 WD-FR-11, Q-9 · S05 [요즘 뜨는 여행지]에서 들어온다

구현 `frontend/src/features/destination`, 주소 `/trends`, 미리보기 `/dev/trends?state=basic|insufficient|loading|error`.

| 상태            | 피그마                                                                                | 이번에 만듦                 |
| --------------- | ------------------------------------------------------------------------------------- | --------------------------- |
| 기본            | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-4933)  | 예                          |
| 자료 부족       | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-5149)  | 예                          |
| 당겨서 새로고침 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=249-1509)  | 예(기기 기본 새로고침 표시) |
| 불러오기 실패   | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-28260) | 예                          |

- 위 기준 세 줄: 📅 "최근 30일 · 09.24 – 10.23", 🧳 "게시된 여행 수 기준", ↻ "매일 오전 6시 갱신 · 오늘 06:00 기준"
- 순위 줄: 순위(1~3위 파랑) + 사진 자리 56 + "강릉 강원" + 🧳 게시 여행 수 + 👥 "친구 3"(0이면 숨김) + 변동(↑2 초록 / ↓1 회색 / 새로 / –)
- 누르면 N3 `/regions/{regionId}`
- 자료 부족: 서버가 모두 `insufficientData`이거나 목록이 비면 "아직 순위가 없어요 / 여행이 모이면 보여요" + [돌아가기]

값: `GET /trends/regions?from&to`(오늘 포함 30일, `destination-rules.trendRange`).

## 백엔드에 필요한 것 / 정한 것

1. 기간·집계 정의(결정 Q-9)가 정해지지 않아 **최근 30일 · 게시된 여행 수 · 매일 06:00 갱신**으로 적었다. 서버가 정하면 글자만 바꾼다
2. `TrendRegion`에 지역 대표 사진이 없어 사진 자리는 아이콘
