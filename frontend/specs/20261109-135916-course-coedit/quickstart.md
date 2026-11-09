# Quickstart: 코스 함께 편집 확인

```bash
npx jest src/features/course
npx tsc --noEmit
npx eslint src/features/course src/app/dev/course-coedit.tsx
```

미리보기: `/dev/course-coedit?state=<상태>`([contracts/routes.md](./contracts/routes.md)).

테스트 모드 흐름(trip-1, 코스가 있는 여행)
1. 여행 상세 → '코스' → [편집] → 1일차 장소 순서 바꾸기.
2. 콘솔 `globalThis.__devMock.course.editByOther('trip-1', 2)` → [완료] → 2일차는 동행 것, 1일차는 내 것인 초안과 다시 얹었다는 안내. [완료]를 다시 누르면 저장.
3. 다시 [편집] → 1일차를 고치고 `editByOther('trip-1', 1)` → [완료] → 확인 상자. [최신 코스 보기]는 동행 코스로 바뀐다.
4. 같은 상황에서 [내 것으로 덮기] → 저장되고 코스 화면으로 돌아간다.
5. [편집] → 1일차를 고치고 `globalThis.__devMock.chat.dropConnection()` → `editByOther('trip-1', 1)` → `__devMock.chat.restore()` → 확인 상자가 [완료]를 누르기 전에 뜬다.
