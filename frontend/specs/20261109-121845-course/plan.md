# Implementation Plan: 코스 짜기·보기

**Branch**: `feature/EODI-233-course` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/20261109-121845-course/spec.md`

## Summary

S23 코스 짜기와 S24 코스를 만든다. 서버 코스(Itinerary)를 받아 화면 초안(CourseDraft)으로 바꾸고, 초안 안에서 순서·장소·구간 수단을 고친 뒤 [완료]에서 규칙에 맞는 전체 교체 본문(ItineraryWrite)으로 바꿔 저장한다. 초안 계산은 모두 순수 함수(course-rules.ts)에 둬 422 구간 오류가 나지 않음을 테스트로 증명한다. 자동 추천은 proposals 작업(JobRef → GET proposal)을, 이동 시간 다시 계산은 routes/recalculate를 API 명세대로 부르고 테스트 모드 가짜 서버가 답한다. 지도는 공통 MapView·MapMarker, 경로선은 네이버 지도 PathOverlay를 감싼 작은 부품(웹은 그리지 않음), 장소 바꾸기는 pickPlace, 기간 넣기는 react-native-calendars(여행 기간 시트와 같은 라이브러리).

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, React Native 0.88 (Expo SDK 58)
**Primary Dependencies**: expo-router, @tanstack/react-query v5, axios(`src/api/client`), expo-crypto, @mj-studio/react-native-naver-map(공통 MapView), react-native-calendars, `src/components/ui`, `src/theme`
**Storage**: TanStack Query 캐시, 초안은 화면 useReducer
**Testing**: jest-expo + RNTL. 초안 규칙·저장 본문·작업 기다림은 단위 테스트, 화면은 RNTL
**Target Platform**: Android 우선, iOS, 웹(미리보기)
**Project Type**: 모바일 앱(Expo)
**Performance Goals**: 초안 조작은 서버 없이 즉시 반영, 저장 요청은 [완료] 한 번에 하나
**Constraints**: 백엔드·DB를 바꾸지 않는다. 지도 컴포넌트를 새로 만들지 않는다. 장소 고르기는 pickPlace. 항목 최대 200
**Scale/Scope**: 화면 2개, 상태 13개 + 장소 시트, 미리보기 1개

## Constitution Check

`.specify/memory/constitution.md`는 채우지 않은 틀이라 원칙 검사는 없다. CONVENTION.md 기준: 라우트는 `src/app`, 코드는 `src/features/course`, 공통 부품·토큰 사용, 새 의존성 없음 — 지킴. 설계 뒤에도 같다.

## Project Structure

### Documentation (this feature)

```text
specs/20261109-121845-course/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/course-api.md, contracts/routes.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── api/
│   ├── errors.ts                       # INVALID_ROUTE_LEGS 추가
│   ├── dev-mock.ts                     # 가짜 코스 서버 연결 몇 줄
│   └── dev-mock-course.ts              # 새 파일: 코스·자동 추천·다시 계산·그룹 즐겨찾기 가짜 서버
├── features/course/
│   ├── types.ts
│   ├── api.ts
│   ├── course-rules.ts (+ .test.ts)    # 초안 변환·고치기·저장 본문·문구
│   ├── testing.ts
│   ├── hooks/
│   │   ├── course-keys.ts
│   │   ├── use-itinerary.ts
│   │   ├── use-save-itinerary.ts
│   │   ├── use-auto-course.ts (+ .test.tsx)
│   │   ├── use-recalculate.ts
│   │   └── use-saved-places.ts
│   ├── components/
│   │   ├── course-map.tsx, route-path.tsx, route-path.web.tsx
│   │   ├── day-tabs.tsx
│   │   ├── transport-chips.tsx
│   │   ├── course-day-list.tsx         # 장소 줄 + 구간 칩
│   │   ├── item-sheet.tsx              # 바꾸기·순서·빼기
│   │   ├── manual-builder.tsx          # 직접 만들기
│   │   ├── setup-views.tsx             # 구성 방식 선택·여행지 미정·기간 없음
│   │   ├── auto-views.tsx              # 자동 추천 생성 중·실패
│   │   ├── region-split.tsx            # 여러 지역 날짜별
│   │   └── route-fail-card.tsx         # S24 이동 시간 갱신 실패
│   └── screens/
│       ├── course-screen.tsx (+ test)  # S24
│       └── course-edit-screen.tsx (+ test) # S23
├── features/trip/components/trip-menu-grid.tsx   # '코스' open 연결
└── app/
    ├── (main)/trips/[tripId]/course/index.tsx
    ├── (main)/trips/[tripId]/course/edit.tsx
    └── dev/course.tsx
```

**Structure Decision**: 투표·준비물과 같은 기능 폴더 구조. 그룹 즐겨찾기 조회는 투표 브랜치에도 있으나 이 브랜치에 없어 course/api.ts에 따로 둔다(합칠 때 하나로).

## Complexity Tracking

없음.
