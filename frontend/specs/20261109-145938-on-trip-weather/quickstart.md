# Quickstart: 여행 중과 날씨 대안 확인

```bash
npx jest src/features/on-trip
npx tsc --noEmit
npx eslint src/features/on-trip src/app/dev/on-trip.tsx
```

미리보기: `/dev/on-trip?state=<상태>`([contracts/routes.md](./contracts/routes.md)).

테스트 모드 흐름(trip-1은 오늘이 2일차라 감천문화마을 하나가 오늘 코스)
1. 여행 상세 → '여행 중' → 날씨 카드, 도구 세 칸, 오늘 코스와 '다음'.
2. 새로고침 → 조회 시각이 바뀐다. `__devMock.weather.failNext()` 뒤 새로고침 → 날씨 갱신 실패와 [다시 시도].
3. [날씨 대안 보기] → 대안 목록 → 하나 고르고 [변경안 만들기] → 변경안을 만들었어요 시트.
4. `__devMock.weather.noAlternativesNext()` 뒤 다시 열기 → 대안 없음 → [준비물에 넣기].
5. 오늘 이미 지난 일정은 비 영향 안내에서 빠진다. 지난 일정만 있으면 날씨 대안 보기 줄이 없고 도구의 날씨 대안 칸으로 연다.
6. 변경안 결과 시트의 [변경안 보기]는 S29가 생기면 연결된다(Q-10-6).

참고: 이 브랜치에는 준비물 가짜 서버가 없어 준비물 칸은 '목록 보기', [준비물에 넣기]는 실패 안내가 뜬다. 준비물 브랜치와 합치면 동작한다.
