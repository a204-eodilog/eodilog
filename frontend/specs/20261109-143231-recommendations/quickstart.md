# Quickstart: 추천 결과 확인

```bash
npx jest src/features/recommend
npx tsc --noEmit
npx eslint src/features/recommend src/app/dev/recommend.tsx
```

미리보기: `/dev/recommend?state=<상태>`([contracts/routes.md](./contracts/routes.md)).

테스트 모드 흐름(trip-1)
1. 여행 상세 → '즐겨찾기' → [추천 받기]. 취향이 없으면 취향 입력 → [추천 보기]로 돌아오면 생성 중.
2. 몇 초 뒤 여행지와 맛집과 스팟. 위 칩으로 묶음 이동.
3. 맛집 [담기] → '담김', 그룹 즐겨찾기에 내 이름으로 보인다.
4. 여행지 [투표 후보로] → 준비 중 안내(Q-9-2).
5. 콘솔 `__devMock.recommend.failNext()` → [재추천] → 생성 실패 → [다시 시도].
6. `__devMock.recommend.insufficientNext()` → [재추천] → 자료 부족 → [장소 더 모으기]는 그룹 즐겨찾기.
