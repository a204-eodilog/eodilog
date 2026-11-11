# Implementation Plan: 기능 잇기

**Branch**: `feature/EODI-298-publish-links` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/20261111-124000-publish-links/spec.md`

## Summary

여행 메뉴의 "게시"와 여행 상세의 [피드로 게시]를 내 여행 기록 화면(S38)으로 잇는다. 주소는 `trip-routes.ts`의 `publishHref` 한곳에서 정한다.

## Technical Context

**Language/Version**: TypeScript 5.x, React Native 0.88 (Expo SDK 58), expo-router
**Testing**: jest-expo + @testing-library/react-native
**Constraints**: 다른 담당 화면(내 여행 기록, 게시 확인 시트)의 코드는 바꾸지 않는다
**Scale/Scope**: 파일 3개와 테스트 2개

## Constitution Check

`.specify/memory/constitution.md`는 채우지 않은 틀이라 검사할 원칙이 없다. `frontend/CONVENTION.md`와 AGENTS.md 규칙을 지킨다.

## Research

- **게시 창이 어디 있나**: 게시 확인 시트 `PublishSheet`는 `features/my-trips`에 있고 내 여행 기록 화면 `/trips/[tripId]/record`가 [게시]를 누르면 띄운다. 그 화면은 주소로 시트를 바로 띄우는 값을 받지 않는다.
- **Decision**: 기록 화면까지 간다. 시트를 바로 띄우려면 그 화면이 값을 받아야 하는데 다른 담당 화면이다(Q-20-1).
- **Alternatives considered**: 여행 상세에 게시 확인 시트를 직접 띄우기 — 게시 요청과 게시 전·게시됨 상태를 여행 상세가 다시 만들어야 한다.

## Project Structure

```text
frontend/src/features/trip/
├── trip-routes.ts (+test)            # publishHref, 피드 단계도 같은 주소
├── components/trip-menu-grid.tsx (+test)   # 게시 메뉴
└── screens/trip-detail-screen.tsx    # [피드로 게시]
```

## 단위 테스트로 증명할 것

- 게시 주소와 피드 단계 주소가 내 여행 기록이다
- 게시 메뉴를 누르면 그 주소로 가고 준비 중 안내가 뜨지 않는다

## Complexity Tracking

적을 것이 없다.
