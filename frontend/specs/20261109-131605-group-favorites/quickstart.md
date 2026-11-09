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
3. [+] → [내 개인 즐겨찾기에서] → 두 곳 골라 담기.
4. 장소 눌러 메모 쓰기, [내 저장 빼기]. 코스에 있는 해운대 해변은 확인이 뜬다.
5. [투표 열기] → 두 곳 체크 → [2곳으로 투표 열기] → 준비 중 안내(Q-7-2).
