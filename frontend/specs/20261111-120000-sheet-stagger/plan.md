# Implementation Plan: 바텀시트와 순서대로 나오는 글

**Branch**: `feature/EODI-296-sheet-stagger` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/20261111-120000-sheet-stagger/spec.md`

## Summary

열린 뒤에야 목록을 받던 내 시트 3개가 여는 버튼이 보일 때 미리 받게 하고, 제목 → 설명 → 내용이 한 줄씩 나오는 공통 부품 `Stagger`를 만들어 바텀시트, 가운데 창, 빈 화면·오류 안내, 새 여행 만들기에 붙인다.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, React Native 0.88 (Expo SDK 58)
**Primary Dependencies**: React Native `Animated`, @tanstack/react-query v5(`enabled`), `theme/motion`, `hooks/use-reduce-motion`
**Testing**: jest-expo + @testing-library/react-native
**Constraints**: 다른 담당 시트와 화면은 고치지 않는다. 새 의존성 없음. 기존 테스트가 그대로 통과해야 한다
**Scale/Scope**: 새 파일 1개(+테스트), 공통 부품 3개, 내 화면 6개

## Constitution Check

`.specify/memory/constitution.md`는 채우지 않은 틀이라 검사할 원칙이 없다. `frontend/CONVENTION.md`와 AGENTS.md 규칙을 지킨다.

## Research

### R1. 목록이 늦게 뜨는 원인 (코드 조사)

| 시트 | 원인 | 조치 |
| --- | --- | --- |
| 투표 열기 (N8) | 후보 출처 조회가 `enabled: visible`이라 시트가 열린 뒤에 요청을 시작한다 | `prefetch`를 받아 여는 버튼이 보일 때 받는다 |
| 후보 추가 (S22) | 위와 같다 | 진행 중인 투표에서는 늘 미리 받는다 |
| 내 즐겨찾기에서 담기 (S20) | 내 즐겨찾기 조회가 `enabled: picking`이라 시트가 열린 뒤에 시작한다 | 장소 추가 시트가 뜨면 받는다 |
| 그 밖의 내 시트 | 화면이 이미 가진 자료를 쓴다 | 없음 |

- 시트 높이를 재느라 늦는 경우는 코드로는 알 수 없다. 휴대폰 녹화가 필요하다(Q-18-1).
- 다른 담당 시트(홈 추천 시트 등)는 고치지 않는다.

### R2. 순서대로 나오는 글

- **Decision**: `Stagger`는 자식을 줄마다 `Animated.View`로 감싸고, 줄 번호 × 60ms 뒤에 투명도 0 → 1, 아래 6px에서 제자리로 200ms 동안 움직인다. `active`가 false면 감춘 채 기다리고 true가 되는 순간 시작한다.
- 감싼 칸은 부모의 직접 자식이라 부모의 줄 간격(gap)이 그대로 먹는다. 가운데 정렬이 필요한 빈 화면 안내는 감싼 칸에도 가운데 정렬을 준다(`itemStyle`).
- **Alternatives considered**: 줄마다 부르는 쪽이 지연 값을 직접 주기 — 설명이 없을 때 간격이 비고 숫자가 화면마다 흩어진다.

### R3. 웹 미리보기의 개발용 경고

- React Native 웹판의 `Animated` 부품은 `collapsable` 속성을 붙여, 개발 화면 콘솔에 "non-boolean attribute" 경고가 나온다. 동작에는 영향이 없고 휴대폰에서는 나오지 않는다.
- 움직일 수 있는 Pressable은 웹에서 이 속성을 떼게 했다(`animated-pressable.tsx`). 그려지는 체크는 움직이는 값을 선에 바로 물리지 않고 숫자로 받아 넘기게 바꿨다. `Animated.View`가 내는 경고는 남아 있다.

## Project Structure

```text
frontend/src/
├── components/ui/stagger.tsx (+test)        # 새로: 순서대로 나오는 글
├── components/ui/animated-pressable.tsx     # 새로: 웹에서 collapsable을 뗀 Pressable
├── components/ui/{bottom-sheet,popup,empty-state,check-mark,button,pressable-scale,index}.tsx
├── theme/motion.ts                          # stagger.gap 60
├── features/poll/hooks/use-saved-places.ts, components/{open-poll-sheet,add-candidate-sheet}.tsx, screens/poll-screen.tsx
├── features/group-favorites/screens/group-favorites-screen.tsx
├── features/recommend/screens/recommend-screen.tsx
└── features/trip/screens/new-trip-screen.tsx
```

## 단위 테스트로 증명할 것

- 줄 3개가 0, 60, 120ms 뒤에 나타나기 시작한다
- 빈 줄은 건너뛴다
- `active`가 false면 기다리고 true가 되면 시작한다
- 동작 줄이기면 움직임 없이 바로 보인다

## Complexity Tracking

적을 것이 없다.
