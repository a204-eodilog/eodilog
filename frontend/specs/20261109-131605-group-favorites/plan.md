# Implementation Plan: 그룹 즐겨찾기

**Branch**: `feature/EODI-235-group-favorites` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

## Summary

S20 그룹 즐겨찾기를 만든다. GET saved-places를 무한 목록으로 받아 담은 사람·겹침을 보이고, 전체·겹친 곳·동행별로 거른다. 목록·지도를 바꿔 보고, 장소 추가 시트(개인 즐겨찾기·장소 검색)로 담고, 장소 시트에서 내 메모를 고치거나 내 저장을 뺀다. 코스에 있는 장소를 빼면 확인을 띄운다. 후보 고르기 모드와 추천 받기는 다른 주제와 합칠 때 마지막 이동을 잇는다.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, React Native 0.88 (Expo SDK 58)
**Primary Dependencies**: expo-router, @tanstack/react-query v5(useInfiniteQuery), axios, 공통 MapView·MapMarker, pickPlace, B의 saved/api getAllBookmarks, `src/components/ui`, `src/theme`
**Storage**: TanStack Query 캐시
**Testing**: jest-expo + RNTL
**Target Platform**: Android 우선, iOS, 웹 미리보기
**Constraints**: 백엔드 변경 없음. B의 개인 즐겨찾기 화면은 바꾸지 않고 캐시 키만 맞춘다
**Scale/Scope**: 화면 1개, 상태 6개 + 시트 3개

## Constitution Check

constitution은 빈 틀이라 검사 없음. CONVENTION 기준 지킴: 라우트 `src/app`, 코드 `src/features/group-favorites`, 공통 부품 사용, 새 의존성 없음.

## Project Structure

```text
src/
├── api/dev-mock.ts, dev-mock-group.ts        # 가짜 그룹 즐겨찾기 서버
├── features/group-favorites/
│   ├── types.ts, api.ts, group-rules.ts (+ test), testing.ts
│   ├── hooks/ group-keys.ts, use-group-favorites.ts, use-favorite-mutations.ts, use-course-places.ts
│   ├── components/ filter-bar.tsx, place-row.tsx, favorites-map.tsx, place-sheet.tsx,
│   │               add-place-sheet.tsx, bookmark-pick-sheet.tsx, member-filter-sheet.tsx,
│   │               in-course-confirm.tsx, favorites-empty.tsx, bottom-actions.tsx
│   └── screens/ group-favorites-screen.tsx (+ test)
├── features/trip/components/trip-menu-grid.tsx  # '즐겨찾기' open
└── app/(main)/trips/[tripId]/favorites.tsx, app/dev/group-favorites.tsx
```

## Complexity Tracking

없음.
