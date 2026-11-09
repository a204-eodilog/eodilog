# Quickstart: 그룹 즐겨찾기 확인

```bash
npx jest src/features/group-favorites
npx tsc --noEmit
npx eslint src/features/group-favorites src/app/dev/group-favorites.tsx
```

미리보기: `/dev/group-favorites?state=<상태>`(contracts/routes.md).

테스트 모드 흐름
1. 여행 상세 → '즐겨찾기' → 목록, [겹친 곳], 지도 버튼.
2. [+] → [장소 검색] → 장소 고르기 → 목록 맨 위.
3. [+] → [내 개인 즐겨찾기에서] → 두 곳 골라 담기. 내가 담은 곳만 '담김'이고, 동행만 담은 광안리 바다뷰 카페를 담으면 줄이 늘지 않고 겹침 2명이 된다.
4. 흰여울문화마을을 눌러 메모 쓰기 → '메모를 저장했어요'. [내 저장 빼기] → 가람이 담은 장소라 목록에 남고 겹친 곳 수가 하나 준다.
5. 가짜 코스에 든 서면 돼지국밥집: [내 저장 빼기] → "동행님이 이 장소를 코스에 넣었어요" 확인. 가짜 코스에는 고친 동행이 없어 '동행'으로 보인다. [최신 목록 보기]는 닫고, [그래도 빼기]는 내 저장만 뺀다.
6. [투표 열기] → 두 곳 체크 → 지도로 바꿔 핀 카드도 체크 → [3곳으로 투표 열기] → 준비 중 안내(Q-7-2). [취소]로 돌아온다.
7. [추천 받기] → 준비 중 안내(Q-7-3).
8. 가짜 서버 조작: 콘솔에서 `globalThis.__devMock.group.saveByOther('trip-1')`로 동행 담기, `reset()`으로 처음 상태.
