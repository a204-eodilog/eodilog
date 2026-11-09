# Routes and API: 코스 함께 편집

| 주소 | 쓰임 | 비고 |
|---|---|---|
| /trips/[tripId]/course/edit | S23 코스 짜기 | 코스 짜기에서 만든 화면에 함께 편집 규칙을 더함 |
| /dev/course-coedit?state= | 미리보기 | conflict, merged, editors, editors-many |

## API
- GET /trips/{tripId}/itinerary → `{ data: Itinerary }`. 409 뒤와 다시 연결 뒤 최신 코스.
- PUT /trips/{tripId}/itinerary `{ expectedVersion, items, legs }` → 200 Itinerary, 409 VERSION_CONFLICT.
- 실시간: 코스 destination 없음(Q-8-1). src/realtime의 연결 상태만 읽는다.

## 테스트 모드 조작
- `globalThis.__devMock.course.editByOther('trip-1', 2)`: 다른 동행이 2일차 순서를 뒤집어 저장한 것처럼 만든다. 일차를 빼면 1일차.
- `globalThis.__devMock.chat.dropConnection()` / `globalThis.__devMock.chat.restore()`: 공유 실시간 연결의 끊김과 다시 연결.
