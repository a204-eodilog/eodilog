# 어디로그 프론트엔드

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
  - 짧은 경로에서도 C++ 목적 파일 경로가 260자를 넘어 막히는 것은 `plugins/with-short-object-paths.js`가 처리한다(CMake 3.31로 긴 경로를 줄여 만든다). 윈도우에서 빌드할 때만 들어가고, 처음 빌드할 때 CMake 3.31이 없으면 SDK에서 내려받는다. 맥·리눅스·EAS 클라우드 빌드는 기본 그대로다.
- `.env`에는 비밀 키를 넣지 않는다. `EXPO_PUBLIC_` 값은 앱에 그대로 들어간다.
- 네이버 지도 키는 `.env`의 `NAVER_MAP_CLIENT_ID`에 넣는다(네이버 클라우드 Maps, 패키지 `com.eodilog.app` 등록). 비워 두면 빌드는 되지만 지도가 안 뜬다. 키를 바꾸면 개발 빌드를 다시 만든다(빌드할 때 앱 설정에 들어간다).
  - EAS 클라우드 빌드에는 `.env`가 올라가지 않는다(gitignore). preview·production 빌드는 EAS 환경 변수로 넣는다: `npx eas-cli@latest env:set --name NAVER_MAP_CLIENT_ID --value <키> --environment preview --visibility sensitive`(production도 같은 방법). 키 값은 문서·커밋에 적지 않는다.

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
