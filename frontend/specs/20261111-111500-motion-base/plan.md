# Implementation Plan: 움직임 공통 기준과 부품

**Branch**: `feature/EODI-292-motion-base` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/20261111-111500-motion-base/spec.md`

## Summary

움직임 기준값을 `theme/motion`에 두고, 눌림·그려지는 체크·팝업 세 가지 공통 부품을 만든다. 공통 버튼·칩·카드·탭 바·동그란 체크에 붙이고, 내 화면의 체크 자리와 팝업 3곳을 새 부품으로 바꾼다. 동작 줄이기가 켜져 있으면 모두 꺼진다.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, React Native 0.88 (Expo SDK 58), React Compiler 켜짐
**Primary Dependencies**: React Native `Animated`, `AccessibilityInfo`, react-native-svg
**Storage**: 없음
**Testing**: jest-expo + @testing-library/react-native
**Target Platform**: Android 우선, iOS, 웹(미리보기)
**Project Type**: 모바일 앱(Expo) — `frontend/src`
**Performance Goals**: 크기·투명도 움직임은 화면 그리는 쪽에서 돌려 화면 갱신을 막지 않는다
**Constraints**: 팀원 화면의 개별 코드는 고치지 않는다. 새 의존성 없음. 기존 테스트가 그대로 통과해야 한다
**Scale/Scope**: 새 파일 6개, 공통 부품 6개 수정, 내 화면 부품 10개 수정

## Constitution Check

`.specify/memory/constitution.md`는 채우지 않은 틀이라 검사할 원칙이 없다. `frontend/CONVENTION.md`와 AGENTS.md 규칙을 지킨다. 설계 뒤 다시 봐도 어긋나는 것이 없다.

## Research

### R1. 움직임을 무엇으로 만드나

- **Decision**: React Native 기본 `Animated`를 쓴다.
- **Rationale**: 이 저장소의 jest 환경에서는 react-native-reanimated를 불러오면 네이티브 모듈이 없어 테스트가 실패한다. 그래서 화면 테스트들이 공통 부품 입구를 통째로 흉내 낸다. 버튼이 reanimated를 쓰면 버튼을 실제로 쓰는 테스트가 모두 깨진다. `Animated`는 jest에서 그대로 돌고, 크기와 투명도는 화면 그리는 쪽에서 돌릴 수 있다.
- **Alternatives considered**: react-native-reanimated — 테스트 환경 설정을 바꿔야 하고 팀원 테스트에 영향을 준다.

### R2. React Compiler의 규칙

- 그리는 중에 `useRef().current`를 읽으면 lint 오류(react-hooks/refs)다.
- **Decision**: `Animated.Value`는 `useState(() => new Animated.Value(1))[0]`으로 한 번만 만든다.

### R3. 동작 줄이기

- **Decision**: `AccessibilityInfo.isReduceMotionEnabled()`와 `reduceMotionChanged` 알림을 앱 전체가 하나로 같이 본다(`hooks/use-reduce-motion`). 움직임을 시작하는 함수는 `isReduceMotion()`으로 그 순간의 값을 본다.
- **Rationale**: 부품마다 따로 물으면 값이 오기 전 첫 움직임이 한 번씩 돈다.

### R4. 그려지는 체크

- **Decision**: 공통 아이콘의 check와 같은 선을 `strokeDasharray`로 감췄다가 `strokeDashoffset`을 0으로 당기며 그린다. 선 길이는 화면 그리는 쪽에서 돌릴 수 없는 속성이라 `useNativeDriver: false`다.
- `CheckMarkWhen`은 처음부터 체크돼 있었는지 기억해, 방금 체크한 것만 그린다(Q-16-2).

### R5. 팝업 부품

- **Decision**: `Popup`은 `Modal`(투명, fade)과 어두운 바탕, 크기가 움직이는 카드로 이루어진다. 카드 모양(`cardStyle`)과 바탕 여백(`backdropStyle`)은 창마다 Figma 값이 달라 부르는 쪽이 넘긴다. 뒤로 가기(`onRequestClose`)와 카드 밖 누르기(`onBackdropPress`)는 부르는 쪽이 정한다.

### R6. 웹 미리보기

- 웹은 화면 그리는 쪽 움직임을 지원하지 않는다. `motion.native`가 웹에서 false다.
- 미리보기 콘솔에 `collapsable` 속성 경고가 한 줄 나온다. react-native-web의 `Animated.View`가 내는 개발용 경고이고 동작에는 영향이 없다.

## Project Structure

```text
frontend/src/
├── theme/motion.ts                      # 새로: 기준값
├── hooks/use-reduce-motion.ts           # 새로: 동작 줄이기
├── components/ui/use-press-scale.ts     # 새로: 눌림 크기
├── components/ui/pressable-scale.tsx    # 새로: 눌림이 든 Pressable
├── components/ui/check-mark.tsx         # 새로: 그려지는 체크
├── components/ui/popup.tsx              # 새로: 가운데 창
├── components/ui/motion.test.tsx        # 새로: 위 부품 테스트
├── components/ui/{button,chip,card,round-check,tab-bar,index}.tsx   # 붙이기
├── features/poll/components/{option-row,candidate-row,add-candidate-sheet}.tsx
├── features/checklist/components/checklist-row.tsx
├── features/group-favorites/components/{place-row,bookmark-pick-sheet,in-course-confirm}.tsx
├── features/on-trip/components/alternative-list.tsx
├── features/course/components/coedit-conflict.tsx
└── features/notification/components/notification-popup.tsx
```

## 단위 테스트로 증명할 것

- 기준값이 정한 숫자와 같다
- 누르면 0.96배로 줄이는 움직임을, 떼면 1배로 돌리는 스프링을 시작한다. 동작 줄이기면 시작하지 않는다
- 버튼은 눌림을 넣어도 onPress가 한 번 불리고, 기다리는 동안 눌리지 않는다
- 체크는 checked일 때만 그린다
- 팝업은 보일 때만 내용을 그리고, 바탕 누르기를 주면 카드 밖을 눌러 닫을 수 있다

## Complexity Tracking

적을 것이 없다.
