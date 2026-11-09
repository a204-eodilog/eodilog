# Quickstart: AI 변경안 확인

```bash
npx jest src/features/proposal
npx tsc --noEmit
npx eslint src/features/proposal src/app/dev/proposal.tsx
```

미리보기: `/dev/proposal?state=<상태>`.

테스트 모드 흐름(trip-1)
1. 여행 상세 → '코스' → 1일차 광안리 [빼기] → S29 생성 중 → 비교: 광안리 바다뷰 카페를 빼요, 숫자 칸, 목록.
2. [적용] → 코스로 바뀌고 "새 코스를 적용했어요" [되돌리기] → 광안리가 돌아온다.
3. 다시 [빼기] → [적용] → `__devMock.course.editByOther('trip-1', 1)` → [되돌리기] → 되돌릴 수 없다는 안내.
4. `__devMock.course.failNextProposal()` → [빼기] → 재계산 실패 → [다시 시도].
5. 여행 중 → 날씨 대안 → 변경안 만들기 → [변경안 보기] → 날씨 변경안 비교.
