# Quickstart: 준비물 체크리스트 확인

## 단위·화면 테스트

```bash
npx jest src/features/checklist src/lib
npx tsc --noEmit
npx eslint src/features/checklist src/app/dev/checklist.tsx "src/app/(main)/trips/[tripId]/checklist.tsx"
```

기대: 규칙·큐·제안 더하기·제안 훅·화면 테스트 60개 통과.

## 미리보기(서버 없이)

```bash
set EXPO_PUBLIC_DEV_MOCK=true&& npx expo start --web --port 8090
```

`http://localhost:8090/dev/checklist?state=default` 등 contracts/routes.md의 state를 하나씩 열어 Figma 201-15314·201-15518·201-30067과 비교한다.

## 테스트 모드 앱 흐름

1. 테스트 모드로 로그인 → 여행 상세 → '여행 중' → 준비물 화면.
2. 체크 상자를 빠르게 여러 번 → 마지막 상태가 남는다.
3. 콘솔 `globalThis.__devMock.checklist.editByOther()` 뒤 체크 → "다른 동행이 먼저 바꿨어요" 안내와 최신 목록.
4. [다시 제안 받기] → 잠시 뒤 새 준비물이 더해지고, 직접 고친 항목은 그대로.
5. `globalThis.__devMock.checklist.failNextSuggestion()` 뒤 [다시 제안 받기] → 실패 카드와 [다시 시도].
6. `globalThis.__devMock.checklist.disableAi()` 뒤 제안 → 꺼짐 카드와 [설정 열기].
7. `globalThis.__devMock.checklist.deleteByOther()` 뒤 첫 항목 체크·고치기·지우기 → "이미 지워진 준비물이에요".
8. 상태를 처음으로 되돌리려면 `globalThis.__devMock.checklist.reset()` 뒤 화면을 다시 연다. `disableAi(false)`로 추천을 다시 켠다.

## 실서버(사용자 몫)

로컬 백엔드 + 웹, 안드로이드 기기에서 같은 흐름을 확인한다.
