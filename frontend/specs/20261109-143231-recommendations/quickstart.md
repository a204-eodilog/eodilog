# Quickstart: 추천 결과 확인

```bash
npx jest src/features/recommend
npx tsc --noEmit
npx eslint src/features/recommend src/app/dev/recommend.tsx
```

미리보기: `/dev/recommend?state=<상태>`([contracts/routes.md](./contracts/routes.md)).

테스트 모드 흐름(trip-1)
1. 여행 상세 → '즐겨찾기' → [추천 받기]. 테스트 모드는 취향이 비어 있어 취향 입력이 먼저 열린다. [나중에]로 돌아오면 생성 중. 여행 상세 '추천' 메뉴도 같은 화면.
2. 몇 초 뒤 여행지와 맛집과 스팟. 위 칩으로 묶음 이동.
3. 맛집 [담기] → '담김', 그룹 즐겨찾기에 내 이름으로 보인다.
4. 여행지 [투표 후보로] → 준비 중 안내(Q-9-2).
5. 콘솔 `__devMock.recommend.failNext()` → [재추천] → 생성 실패 → [다시 시도].
6. `__devMock.recommend.insufficientNext()` → [재추천] → 자료 부족 → [장소 더 모으기]는 그룹 즐겨찾기.
7. 두 곳의 [담기]를 잇달아 눌러도 둘 다 '담김'.

참고: 테스트 모드에서 취향 입력의 [추천 보기] 저장은 실패 안내가 뜬다. 취향 입력 화면 쪽 가짜 서버 문제라 [나중에]로 확인한다.
