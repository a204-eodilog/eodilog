# 이어행 프론트엔드

Expo SDK 58 · React Native · TypeScript · Expo Router · TanStack Query · Zustand

## 시작하기

```bash
npm ci
cp .env.example .env
npm start
```

- 앱은 Expo Go가 아니라 **개발 빌드**로 실행한다. 개발 빌드는 네이티브 패키지를 추가했을 때만 다시 만든다.
  - Android: `npm run build:android`
  - iOS: `npx eas-cli@latest build --profile development --platform ios`
- 레포는 `C:\dev\EODI`처럼 **짧은 영문 경로**에 클론한다. 경로에 한글이 있거나 길면 Android 빌드가 실패한다.
- `.env`에는 비밀 키를 넣지 않는다. `EXPO_PUBLIC_` 값은 앱에 그대로 들어간다.

## 스크립트

| 명령                | 설명            |
| ------------------- | --------------- |
| `npm start`         | 개발 서버 실행  |
| `npm run lint`      | ESLint 검사     |
| `npm run format`    | Prettier로 정리 |
| `npm run typecheck` | 타입 검사       |

## 문서

- 폴더 구조와 코드 규칙: [CONVENTION.md](./CONVENTION.md)
- 화면 목록·흐름·디자인 결정: [screen-list.md](../docs/flow/screen-list.md), [user-flow.md](../docs/flow/user-flow.md), [design-decisions.md](../docs/design/design-decisions.md)
