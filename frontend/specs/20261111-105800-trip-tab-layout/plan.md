# Implementation Plan: 여행 탭 배치 바꾸기

**Branch**: `feature/EODI-291-trip-tab-layout` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/20261111-105800-trip-tab-layout/spec.md`

## Summary

여행 탭(S15)의 두 묶음 모양을 맞바꾼다. 다음 계획은 세로 줄, 다녀온 여행은 옆으로 넘기는 카드가 된다. 다음 계획은 3개까지 보이고 "더 보기"로 펼친다.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, React Native 0.88 (Expo SDK 58)
**Primary Dependencies**: `src/components/ui`(AvatarGroup, Icon), `src/theme`, 기존 `DateBlock`
**Storage**: 없음. 펼친 상태는 화면 상태로만 둔다
**Testing**: jest-expo. 둘째 줄 글과 보이는 수는 순수 규칙 단위 테스트
**Target Platform**: Android 우선, iOS, 웹(미리보기)
**Project Type**: 모바일 앱(Expo) — `frontend/src`
**Constraints**: 맨 위 파랑 카드와 빈·오류 상태는 건드리지 않는다. 새 의존성 없음
**Scale/Scope**: 화면 1개, 부품 2개 이름 바꾸기, 규칙 파일 1개, 아이콘 2개 추가

## Constitution Check

`.specify/memory/constitution.md`는 채우지 않은 틀이라 검사할 원칙이 없다. `frontend/CONVENTION.md`와 AGENTS.md 규칙을 지킨다. 설계 뒤 다시 봐도 어긋나는 것이 없다.

## Research

- **부품을 어떻게 나누나**: 줄 모양(`PastTripRow`)과 카드 모양(`NextTripCard`)이 이미 있다. 이름이 묶음에 묶여 있어 맞바꾸면 뜻이 어긋난다.
  - **Decision**: 모양 이름으로 바꾼다. `TripRow`(줄), `TripCard`(카드). 둘 다 `kind`(next·past)를 받아 달력 칸 색과 둘째 줄 글을 고른다.
  - **Alternatives considered**: 화면에서 두 부품의 자리만 바꾸기 — 다음 계획 줄에 D-N이, 다녀온 여행 카드에 몇 박 며칠이 나와야 해서 부품 안의 글 규칙도 바뀌어야 한다.
- **둘째 줄 글과 보이는 수**: 화면 밖 순수 규칙 `trip-list-rules.ts`에 둔다. `tripListLead`(D-N·N일차·몇 박 며칠), `visibleNextTrips`(3개와 접힌 수).
- **펼치기·접기 아이콘**: 공통 Icon에 `chevron-down`, `chevron-up`이 없어 더한다. 더하기만 하므로 다른 화면은 바뀌지 않는다.

## Project Structure

```text
frontend/src/features/trip/
├── trip-list-rules.ts (+test)        # 새로: 둘째 줄 글, 보이는 수
├── components/trip-row.tsx           # past-trip-row.tsx에서 이름 바꿈. kind를 받는다
├── components/trip-card.tsx          # next-trip-card.tsx에서 이름 바꿈. kind를 받는다
└── screens/trip-list-screen.tsx      # 두 묶음 자리 바꾸기, 더 보기·접기
frontend/src/components/ui/icon.tsx   # chevron-down, chevron-up
docs/design/design-decisions.md       # S15 여행 목록 줄
```

## 단위 테스트로 증명할 것

- 다음 계획의 둘째 줄 앞 글은 D-N이나 N일차, 다녀온 여행은 몇 박 며칠이고 올해가 아니면 연도가 붙는다
- 5개 중 3개만 보이고 접힌 수는 2다. 펼치면 5개다. 3개 이하면 접을 것이 없다

## Complexity Tracking

적을 것이 없다.
