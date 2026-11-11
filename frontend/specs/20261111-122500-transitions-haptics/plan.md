# Implementation Plan: 탭·화면 전환과 진동

**Branch**: `feature/EODI-297-transitions-haptics` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/20261111-122500-transitions-haptics/spec.md`

## Summary

탭 화면 묶음과 그 위에 쌓이는 화면 묶음의 전환을 정하고, 진동 다섯 가지를 이름으로 부르는 도우미를 만들어 공통 부품과 내 화면의 성공 지점에 붙인다.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, React Native 0.88 (Expo SDK 58)
**Primary Dependencies**: expo-router 탭(`animation: 'fade'`, `transitionSpec`)과 스택(`animation: 'slide_from_right' | 'slide_from_bottom'`), expo-haptics 58(이미 설치돼 있다)
**Testing**: jest-expo. 진동 도우미는 expo-haptics를 흉내 내 단위 테스트
**Constraints**: 새 의존성 없음. 다른 담당 화면의 개별 코드는 고치지 않는다
**Scale/Scope**: 새 파일 1개(+테스트), 레이아웃 2개, 공통 부품 6개, 내 화면 훅 4개

## Constitution Check

`.specify/memory/constitution.md`는 채우지 않은 틀이라 검사할 원칙이 없다. `frontend/CONVENTION.md`와 AGENTS.md 규칙을 지킨다.

## Research

- **쓸 수 있는 옵션 확인**: 설치된 패키지의 타입에서 확인했다.
  - 탭: `node_modules/expo-router/build/react-navigation/bottom-tabs/types.d.ts`의 `animation?: 'none' | 'fade' | 'shift'`, `transitionSpec`
  - 스택: `react-native-screens`의 `StackAnimationTypes`에 `slide_from_right`, `slide_from_bottom`
  - 진동: `expo-haptics`의 `impactAsync`, `selectionAsync`, `notificationAsync`
- **탭 전환**: `fade`에 150ms. 길면 탭이 굼떠 보인다.
- **화면 전환**: (main) 스택의 기본을 `slide_from_right`로 두고 `trips/new`만 `slide_from_bottom`으로 둔다.
- **진동을 어디서 부르나**
  - **Decision**: 공통 부품 안에서 부른다. 탭 바(가볍게), 주요 버튼(가볍게), 칩(선택), 그려지는 체크(선택), 확인 시트(경고), 실패 안내(실패). 성공은 화면마다 뜻이 달라 내 화면의 성공 지점 4곳에서 직접 부른다.
  - **Rationale**: 부르는 곳을 하나하나 고치지 않아도 앱 전체가 같은 규칙을 따른다.
- **실패에 강하게**: 진동은 웹에서 아무 일도 하지 않고, 모듈이 없거나 실패해도 오류를 삼킨다. 화면 동작을 막으면 안 된다.

## Project Structure

```text
frontend/src/
├── lib/haptics.ts (+test)                         # 새로: 진동 다섯 가지
├── app/(main)/_layout.tsx                         # 스택 전환
├── app/(main)/(tabs)/_layout.tsx                  # 탭 전환
├── components/ui/{tab-bar,button,chip,check-mark,confirm-sheet,toast}.tsx
├── features/trip/hooks/{use-create-trip,use-update-trip}.ts
├── features/poll/hooks/use-open-poll.ts
└── features/proposal/hooks/use-proposal.ts
```

## 단위 테스트로 증명할 것

- 다섯 가지가 저마다 다른 진동을 부른다
- 진동이 실패하거나 던져도 도우미는 던지지 않는다

## Complexity Tracking

적을 것이 없다.
