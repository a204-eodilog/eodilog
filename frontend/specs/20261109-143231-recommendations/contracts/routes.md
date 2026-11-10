# Routes and API: 추천 결과

| 주소 | 쓰임 |
|---|---|
| /trips/[tripId]/recommend | S21 추천 결과. S20 [추천 받기], S17 '추천' |
| /dev/recommend?state= | 미리보기: loading, success, no-overlap, insufficient, failed |

## API
- POST /trips/{tripId}/recommendations `{}` → 202 `{ data: JobRef }`
- GET /trips/{tripId}/recommendations/{jobId} → `{ data: RecommendationResult }`. 다른 여행의 작업이면 404 JOB_NOT_FOUND
- PUT /trips/{tripId}/saved-places/{placeId}/me → 그룹에 담기(7번)

## 테스트 모드 조작
- `globalThis.__devMock.recommend.failNext()`: 다음 추천을 실패로 끝낸다
- `globalThis.__devMock.recommend.insufficientNext()`: 다음 추천을 자료 부족으로 끝낸다
