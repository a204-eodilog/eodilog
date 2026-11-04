# Implementation Plan: 여행 만들기와 여행 상세

**Branch**: `feat/EODI-175` | **Date**: 2026-11-03 (갱신 2026-11-04) | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261030-092912-trip-create-detail/spec.md`

## Summary

여행 탭(S15)에서 참여 중인 여행을 상태별로 묶어 보여 주고, 새 여행(S16)을 이름만으로 만들고, 여행 상세(S17)에서 상태에 맞는 '지금 할 일'과 여행 메뉴를 보여 준다. 화면은 `src/theme` 토큰과 `src/components/ui` 공통 부품으로 만든다. 함께 하단 탭 뼈대(-55)와 공통 API 처리(오류 변환, `Idempotency-Key`, 403 프로필 미완성)를 만든다. 토큰 갱신을 한 번만 하는 처리는 이미 `src/api/session.ts`에 있다.

여행 응답에는 D-day·지역 이름이 없다. D-day·일차·여행 상태는 앱이 서울 날짜로 계산하고, 지역 이름은 지역 API로 따로 불러와 캐시한다.

## 2026-11-04 명세 갱신으로 바뀐 것

11-03 계획대로 구현이 진행 중이다(`tasks.md`). 11-04 명세 보완으로 아래가 달라졌다. 구현에 반영할 남은 일은 `/speckit-converge`로 `tasks.md`에 붙인다.

| # | 바뀐 것 | 근거 | 결정 |
| --- | --- | --- | --- |
| C1 | 여행 상태를 서버 `status` 대신 기간 + 서울 오늘로 앱이 계산. 앱이 다시 앞으로 오면 오늘을 새로 구함 | FR-018a, 자정 경계 | [R6](./research.md#r6-여행-상태d-day날짜-표시) |
| C2 | 목록은 최대 5쪽에서 멈추지 않고 `limit=100`으로 끝까지 받은 뒤 묶음 | FR-013a, SC-006 | [R7](./research.md#r7-목록-묶기와-모두-받기) |
| C3 | 여행지 2곳은 "부산·강릉", 3곳 이상은 "부산 외 2곳" | 명세 Edge Cases | [R14](./research.md#r14-여행지동행-표시-줄이기) |
| C4 | 기간 시트에서 지난 날짜도 고를 수 있음(지금은 오늘부터만) | 명세 Edge Cases | [R13](./research.md#r13-지난-날짜-선택) |
| C5 | 여행 탭에 돌아오면 목록을 다시 받음. 앱이 다시 앞으로 오면 Query도 다시 받음 | FR-016a | [R15](./research.md#r15-돌아왔을-때-새로-받기) |
| C6 | 여행 중 상세에 "오늘 코스가 아직 없어요" 줄 | US3-3 | [R12](./research.md#r12-아직-없는-기능과-연결할-자리) |
| C7 | 진행 단계의 '게시됨'은 강조하지 않음 | 명세 Assumptions | [R12](./research.md#r12-아직-없는-기능과-연결할-자리) |

## Technical Context

**Language/Version**: TypeScript 6, React 19.3, React Native 0.88 (Expo SDK 58, React Compiler 켜짐, expo-router `typedRoutes` 켜짐)

**Primary Dependencies**: 모두 이미 설치돼 있다. 새로 추가하는 패키지는 없다.

- expo-router: 탭·스택. 주소는 typed route로 쓴다
- @tanstack/react-query: 서버 상태
- zustand: S16 입력 중 상태
- axios: `apiClient`
- @shopify/flash-list 2.3: 목록
- @gorhom/bottom-sheet + react-native-calendars: 기간 시트. 시트는 공통 `BottomSheet`를 쓴다
- dayjs: 날짜 계산
- expo-crypto: `randomUUID`
- `components/ui/icon.tsx`: 아이콘

**Storage**: 서버 데이터는 TanStack Query 메모리 캐시만 쓴다. 기기에 새로 저장하는 데이터는 없다. 앱을 새로 켠 뒤 오프라인이면 목록이 없다(SC-007 범위 밖).

**Testing**: jest-expo + @testing-library/react-native. 계산 로직만 단위 테스트한다: 상태·D-day·목록 묶기·날짜 표시·여행지 표시·멱등 키·오류 변환.

**Target Platform**: Android(시연·배포 기준). 개발 빌드에서 확인한다.

**Project Type**: mobile-app (`frontend/`)

**Performance Goals**:

- 목록 스크롤 60fps
- 여행 만들기 버튼을 연타해도 서버에 남는 여행은 1건(SC-002)
- 여행 45개 계정에서 여행 탭 첫 화면까지 요청 1번(`limit=100`)

**Constraints**:

- API 계약은 백엔드 코드를 기준으로 한다(`EodiLog/src/main/java`, 2026-11-04 확인).
  - `POST /api/v1/trips`: `Idempotency-Key`는 1~100자이고 필수이며 24시간 보관된다.
  - `GET /api/v1/me/trips`: `status?`·`cursor?`·`limit`(기본 20, 최대 100)을 받는다. 정렬은 만든 순서다.
  - `GET /api/v1/regions`: `query`가 필수이고 이름 부분 일치로 찾는다.
- 요청 본문에 모르는 필드를 넣으면 400이므로 계약에 있는 필드만 보낸다.
- 날짜는 서울 기준이다. 기기 시간대와 상관없이 같은 결과가 나와야 한다.

**Scale/Scope**:

- 화면: S15·S16·S17, 여행지 검색
- 시트: 기간, 프로필 미완성
- 탭 뼈대

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md`는 팀이 아직 정하지 않아 빈 양식이다. 그때까지 아래를 관문으로 쓴다.

| 관문 | 근거 | 결과 |
| --- | --- | --- |
| 폴더·이름 규칙: 기능 코드는 `features/trip/...`, 라우트 파일은 `src/app`에서 화면을 내보내기만 | `frontend/CONVENTION.md` | 통과 |
| 색·글자·간격은 토큰만 쓰고 StyleSheet로 작성. 공통 부품(`components/ui`)과 아이콘(`icon.tsx`)을 다시 쓴다 | `CONVENTION.md`, 사용자 입력 | 통과 |
| 서버 데이터는 TanStack Query에 두고 zustand에 복사하지 않는다. zustand에는 입력 중 상태만 둔다 | `CONVENTION.md` | 통과. `useNewTripDraft`만 zustand |
| 새 패키지는 `npx expo install`로만 추가 | `frontend/AGENTS.md` | 해당 없음(추가 없음) |
| 끝내기 전 lint·typecheck 통과 | `frontend/AGENTS.md` | 구현 단계에서 확인 |
| 다른 팀원이 진행 중인 부품(확인 시트 -174, UI 부품 2차 -172)을 새로 만들지 않음 | 진행 중 브랜치 | 통과. 이 명세는 둘 다 쓰지 않음 |

설계 후 재확인: 통과. 위반 없음.

## Project Structure

### Documentation (this feature)

```text
specs/20261030-092912-trip-create-detail/
├── spec.md
├── plan.md              # 이 문서
├── research.md          # 결정과 근거
├── data-model.md        # 앱이 쓰는 타입과 계산 규칙
├── quickstart.md        # 확인 시나리오
├── contracts/
│   ├── trips-api.md     # 이 명세가 쓰는 서버 API (백엔드 코드 기준)
│   └── routes.md        # 화면 주소와 이동 규칙
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks 출력
```

### Source Code (`frontend/`)

```text
src/
├── api/
│   ├── errors.ts            # 서버 오류 → ApiError, 오류 코드 상수
│   ├── errors.test.ts
│   ├── idempotency.ts       # 동작마다 키를 만들고 재시도에 같은 키를 쓰는 도구
│   ├── idempotency.test.ts
│   └── query-focus.ts       # 새로(C5): AppState → TanStack focusManager·onlineManager 연결
├── lib/
│   ├── seoul-date.ts        # 서울 기준 오늘, 일 수 차이, "11.14(토)" 표시
│   └── seoul-date.test.ts
├── hooks/
│   └── use-seoul-today.ts   # 새로(C1): 앱이 다시 앞으로 오면 서울 오늘을 새로 구하는 훅
├── app/(main)/
│   ├── _layout.tsx          # Stack 안에 (tabs) 그룹과 trips/* 화면
│   ├── (tabs)/
│   │   ├── _layout.tsx      # Tabs + 공통 TabBar
│   │   ├── home.tsx         # 기존 (main)/home.tsx를 옮김
│   │   ├── trips.tsx        # S15
│   │   ├── saved.tsx        # 자리만 (B 담당)
│   │   ├── chats.tsx        # 자리만 (C 채팅 명세)
│   │   └── me.tsx           # 자리만 (A 담당)
│   └── trips/
│       ├── new.tsx          # S16
│       ├── new-region.tsx   # 여행지 검색
│       └── [tripId].tsx     # S17
└── features/trip/
    ├── api.ts               # 여행·지역 API 함수
    ├── types.ts
    ├── trip-rules.ts        # 상태 계산, 목록 묶기, 상세 단계·제목, 표시 문구
    ├── trip-rules.test.ts
    ├── hooks/
    │   ├── use-new-trip-draft.ts
    │   ├── use-my-trips.ts       # 모두 받기(C2) + 묶기
    │   ├── use-trip.ts
    │   ├── use-region-search.ts
    │   ├── use-region-names.ts
    │   └── use-create-trip.ts
    ├── components/
    │   ├── upcoming-trip-card.tsx
    │   ├── trip-row.tsx
    │   ├── date-range-sheet.tsx
    │   ├── profile-incomplete-sheet.tsx
    │   ├── trip-hero.tsx
    │   ├── todo-steps.tsx
    │   └── trip-menu-grid.tsx
    └── screens/
        ├── trip-list-screen.tsx
        ├── new-trip-screen.tsx
        ├── region-search-screen.tsx
        └── trip-detail-screen.tsx
```

**Structure Decision**: `frontend/` 단일 앱이다.

- 기능 코드는 `features/trip`에 둔다.
- 여러 기능이 쓸 오류·멱등·날짜·포커스 도구는 `src/api`·`src/lib`·`src/hooks`에 둔다.
- S16의 입력값(이름·기간·여행지)은 S16과 여행지 검색 화면이 함께 쓴다. 그래서 작은 zustand 스토어 `useNewTripDraft`에 둔다. 서버 데이터가 아닌 입력 중 상태라 `CONVENTION.md` 규칙과 맞다.

## 측정할 것

- **연타 시 요청 수**: [여행 만들기]를 10번 연타했을 때 서버로 간 `POST /trips` 수와 만들어진 여행 수. 목표는 1건이다(SC-002). axios 요청 로그로 센다.
- **스크롤 프레임**: 여행 50개 목록. preview 빌드에서 Flashlight로 1번 기록해 기준값을 남긴다.
- **첫 화면 요청 수**: 여행 45개 계정에서 여행 탭 첫 화면까지 `GET /me/trips` 요청 수. 목표는 1번이다.

## 단위 테스트로 증명할 것

- **서울 날짜 경계**: 14:59Z/15:00Z(= 23:59/00:00 KST)에서 오늘·상태·D-day가 바뀐다. 기기 시간대를 바꿔도 결과가 같다.
- **상태 계산**: 시작일 전날 PLANNING, 당일 ONGOING, 종료일 ONGOING, 종료 다음 날 COMPLETED, 기간 없음 PLANNING.
- **목록 묶기**:
  - 맨 위 카드는 여행 중이 다가오는 여행보다 먼저다.
  - 여행 중이 둘이면 남은 하나가 다음 계획 맨 앞에 온다.
  - 다음 계획은 시작일 순이고 미정은 뒤에 온다.
  - 다녀온 여행은 최근에 끝난 순이다.
- **상세 단계·제목**: 상태 표 5행과, 여행지 없는 여행 중·다녀옴의 제목.
- **여행지·동행 표시**: 여행지 1·2·3곳, 동행 0·2·4명.
- **멱등 키**: 같은 입력으로 다시 보내면 같은 키, 입력이 바뀌면 새 키, 성공하면 버린다.
- **오류 변환**: `{error}` 본문, 네트워크 끊김, 시간 초과, 403 `PROFILE_INCOMPLETE`, 404 `TRIP_NOT_FOUND`, 409 `REQUEST_IN_PROGRESS`.

## Complexity Tracking

위반 없음.
