# 이어행 프론트엔드 컨벤션

## 폴더 구조

```
frontend/
├─ src/
│  ├─ app/                 Expo Router 라우트. 화면 파일과 _layout.tsx만 둔다
│  ├─ features/            기능별 코드
│  │  └─ <feature>/
│  │     ├─ screens/       라우트가 불러오는 화면 컴포넌트
│  │     ├─ components/    이 기능에서만 쓰는 컴포넌트
│  │     ├─ hooks/         이 기능의 훅, TanStack Query 훅 포함
│  │     ├─ api.ts         이 기능의 API 호출 함수
│  │     └─ types.ts
│  ├─ components/ui/       여러 기능에서 쓰는 공통 UI 컴포넌트
│  ├─ api/                 axios 인스턴스, QueryClient, 공통 API 타입
│  ├─ stores/              Zustand 전역 상태
│  ├─ theme/               색상, 글꼴, 간격 토큰
│  ├─ hooks/               여러 기능에서 쓰는 공통 훅
│  ├─ lib/                 날짜, 저장소, 권한 같은 유틸
│  ├─ config/              환경 변수 읽기
│  └─ constants/           앱 전역 상수
├─ assets/                 이미지, 폰트
├─ app.json                앱 이름, 번들 ID, config plugin
└─ eas.json                EAS 빌드 프로필
```

- `src/app/`의 라우트 파일은 `features/*/screens`의 화면을 불러와 내보내기만 한다. 탭 구성이 바뀌어도 라우트 파일만 옮기면 된다.
- 기능 폴더 이름은 PRD 기능 묶음에 맞춘다: `auth` `trip` `camper` `photo` `preference` `course` `driver` `map` `family` `chat` `wrap` `settings` `notification`.
- 한 기능에서만 쓰는 코드는 그 기능 폴더에 둔다. 두 기능 이상에서 쓰게 되면 `components/ui`, `hooks`, `lib`로 옮긴다.
- 다른 기능 폴더의 내부 파일을 직접 불러오지 않는다. 필요하면 공통 폴더로 옮긴다.

## 파일과 이름 규칙

| 대상           | 파일 이름              | 내보내는 이름                | 예시                                   |
| -------------- | ---------------------- | ---------------------------- | -------------------------------------- |
| 컴포넌트       | kebab-case             | PascalCase                   | `course-card.tsx` → `CourseCard`       |
| 화면           | kebab-case + `-screen` | PascalCase + `Screen`        | `login-screen.tsx` → `LoginScreen`     |
| 훅             | `use-` + kebab-case    | camelCase                    | `use-course-list.ts` → `useCourseList` |
| Zustand 스토어 | kebab-case + `-store`  | `use` + PascalCase + `Store` | `session-store.ts` → `useSessionStore` |
| 유틸           | kebab-case             | camelCase                    | `format-date.ts` → `formatDate`        |
| 타입           | `types.ts`             | PascalCase                   | `Course`, `CourseItem`                 |
| 상수           | kebab-case             | UPPER_SNAKE_CASE             | `API_TIMEOUT_MS`                       |
| 라우트         | Expo Router 규칙       | `default export`             | `src/app/(auth)/login.tsx`             |

- 라우트 파일만 `default export`를 쓴다. 나머지는 이름 있는 내보내기를 쓴다.
- 플랫폼별 파일은 `.ios.tsx`, `.android.tsx` 접미사를 쓴다.

## 코드 규칙

- 불러오기 경로는 `@/` 별칭을 쓴다. `@/features/auth/...`, `@/components/ui/...`
- 서버 데이터는 TanStack Query로 다룬다. 서버 응답을 Zustand에 복사하지 않는다.
- Zustand에는 로그인 세션, 현재 선택한 여행처럼 앱 전역 클라이언트 상태만 둔다.
- 색상, 글꼴, 간격은 `src/theme`의 토큰을 쓴다. 컴포넌트에 색상 값을 직접 쓰지 않는다.
- 환경 변수는 `src/config/env.ts`를 통해서만 읽는다.
- 패키지는 `npx expo install <패키지>`로 설치한다. SDK와 맞는 버전이 들어간다.

## 커밋 전 확인

```bash
npm run lint
npm run typecheck
npm run format:check
```
