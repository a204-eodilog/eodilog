# Implementation Plan: 준비물 체크리스트

**Branch**: `feature/EODI-232-checklist` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/20261109-112734-checklist/spec.md`

## Summary

S27 준비물 체크리스트 화면을 만든다. 여행마다 동행이 함께 쓰는 목록 하나를 보고, 체크·추가·이름 고치기·지우기를 하고, AI 제안 작업으로 준비물을 더한다. 체크는 누르는 즉시 화면에 반영하고 항목마다 저장 요청을 하나씩만 보내 마지막 상태로 맞춘다. 다른 동행의 변경은 version으로 막고 충돌하면 목록을 다시 받는다. 제안은 Idempotency-Key로 작업 하나를 만들고 작업 상태를 1.5초 간격으로 물어 성공하면 지금 목록에 없는 이름만 하나씩 채택한다. 진입은 S17 '여행 중' 메뉴(임시), 미리보기는 `/dev/checklist`.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, React Native 0.88 (Expo SDK 58)
**Primary Dependencies**: expo-router(typed routes), @tanstack/react-query v5, axios(`src/api/client`), expo-crypto(randomUUID), `src/components/ui`(Header, AvatarGroup, BottomSheet, TextField, Button, Tag, Icon, toast, EmptyState, ErrorState), `src/theme` 토큰
**Storage**: 서버 상태는 TanStack Query 캐시만 쓴다. 기기 저장 없음
**Testing**: jest-expo + @testing-library/react-native. 순수 규칙·큐는 단위 테스트, 화면은 RNTL
**Target Platform**: Android 우선, iOS, 웹(미리보기·테스트 모드)
**Project Type**: 모바일 앱(Expo) — `frontend/src`
**Performance Goals**: 체크 반영 0.1초 안(저장을 기다리지 않음), 5번 연타에 요청 3번 이하
**Constraints**: 백엔드·DB는 바꾸지 않는다. A·B 담당 화면은 진입 연결 한 줄만 고친다. 사용자 문구는 한국어
**Scale/Scope**: 여행당 항목 수십 개, 페이지 없음. 화면 1개 + 시트 1개 + 미리보기 1개

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

`.specify/memory/constitution.md`는 채우지 않은 틀이라 검사할 원칙이 없다. 대신 `frontend/CONVENTION.md`와 AGENTS.md 규칙을 지킨다.

- 라우트는 `src/app/` 아래, 화면 밖 코드는 `src/features/checklist/`에 둔다 — 지킴
- 공통 부품·토큰을 쓰고 새 의존성을 더하지 않는다 — 지킴(아이콘 'more' 하나를 공통 Icon에 더한다)
- 끝내기 전에 lint·typecheck를 돌린다 — tasks에 넣음

설계 뒤 다시 봐도 어긋나는 것이 없다.

## Project Structure

### Documentation (this feature)

```text
specs/20261109-112734-checklist/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── checklist-api.md
│   └── routes.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── api/
│   ├── errors.ts                      # 코드 추가: CHECKLIST_ITEM_NOT_FOUND, AI_FEATURE_DISABLED, SUGGESTION_ALREADY_ADOPTED
│   ├── dev-mock.ts                    # 가짜 준비물 서버 연결 몇 줄
│   └── dev-mock-checklist.ts          # 새 파일: 테스트 모드 가짜 준비물·제안·작업 서버
├── lib/korean.ts (+ korean.test.ts)   # withIGa 추가
├── components/ui/icon.tsx             # 'more' 아이콘 추가
├── features/checklist/
│   ├── types.ts
│   ├── api.ts
│   ├── checklist-rules.ts (+ .test.ts)
│   ├── check-queue.ts (+ .test.ts)
│   ├── suggestion-merge.ts (+ .test.ts)
│   ├── testing.ts
│   ├── hooks/
│   │   ├── checklist-keys.ts
│   │   ├── use-checklist.ts
│   │   ├── use-toggle-check.ts
│   │   ├── use-item-mutations.ts      # 추가·이름 고치기·지우기
│   │   └── use-suggest-checklist.ts (+ .test.tsx)
│   ├── components/
│   │   ├── checklist-progress.tsx
│   │   ├── checklist-row.tsx
│   │   ├── add-item-bar.tsx
│   │   ├── edit-item-sheet.tsx
│   │   ├── suggest-fail-card.tsx
│   │   └── checklist-empty.tsx
│   └── screens/
│       ├── checklist-screen.tsx
│       └── checklist-screen.test.tsx
├── features/trip/components/trip-menu-grid.tsx   # '여행 중' open 연결
└── app/
    ├── (main)/trips/[tripId]/checklist.tsx
    └── dev/checklist.tsx
```

**Structure Decision**: 투표(4번 주제)와 같은 기능 폴더 구조를 쓴다. 투표 브랜치는 아직 dev에 없으므로 ballot-queue를 가져오지 않고 준비물 전용 check-queue를 따로 만든다. dev-mock.ts는 투표 브랜치도 몇 줄 고치므로 두 브랜치를 합칠 때 같은 자리 충돌이 날 수 있다(한 줄씩 둘 다 남기면 된다).

## Complexity Tracking

없음.
