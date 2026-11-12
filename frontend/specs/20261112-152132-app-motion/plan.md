# Implementation Plan: 앱 전체 움직임과 효과

**Branch**: `feature/EODI-333-app-motion` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/20261112-152132-app-motion/spec.md`

## Summary

공통 눌림 부품을 넓혀 화면 쪽의 누르는 칸 전부에 끼우고, 뼈대·차례로 나타나기·굴러가는 숫자·진행 막대·톡 튀기·색종이 부품을 새로 만들어 화면에 적용한다.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, React Native 0.88 (Expo SDK 58)
**Primary Dependencies**: React Native `Animated`(지금 공통 움직임 부품이 모두 이것으로 돼 있다). 새 의존성 없음
**Testing**: jest-expo, RNTL. 움직임은 어떤 움직임을 시작하는지와 동작 줄이기에서의 끝 모양을 본다
**Constraints**: 크기·위치·투명도만 화면 그리는 쪽에서 움직인다. 막대 폭과 숫자는 자바스크립트에서 움직인다. `ios/`, `android/`는 고치지 않는다
**Scale/Scope**: 새 공통 부품 6개(+테스트), 기준값 추가, 화면 쪽 파일 100개 남짓의 부품 이름 바꿔 끼우기

## Constitution Check

`.specify/memory/constitution.md`는 채우지 않은 틀이라 검사할 원칙이 없다. `frontend/CONVENTION.md`와 AGENTS.md 규칙을 지킨다.

## Research

- **눌림 부품에 함수형 스타일**
  - **Decision**: `PressableScale`이 눌림 상태를 스스로 기억하고 함수형 스타일을 그 값으로 풀어서 넘긴다.
  - **Rationale**: 움직이는 Pressable은 함수형 스타일을 받지 못한다. 화면 쪽 100곳 남짓이 `pressed && styles.pressed`를 쓴다.
- **넓은 칸은 덜 줄이기**
  - **Decision**: 칸의 폭을 재서 240을 넘으면 0.98배를 쓴다.
  - **Rationale**: 화면 폭만큼 넓은 줄이 0.96배로 줄면 양옆이 7px씩 들어가 흔들려 보인다. 쓰는 곳마다 값을 넘기지 않아도 된다.
- **한꺼번에 바꿔 끼우기**
  - **Decision**: 스크립트로 화면 쪽의 `<Pressable`을 `<PressableScale`로 바꾸고 import를 고친다. 화면 전체 로딩(스타일에 `flex: 1`이 있는 동그라미)은 `SkeletonList`로 바꾼다.
  - **Alternatives**: 하나씩 손으로 고치기는 230곳이라 빠뜨리기 쉽다.
- **뼈대**: 회색 줄의 투명도를 1과 0.5 사이로 800ms마다 오가게 한다. 빛이 지나가는 효과는 그림자 겹침이 필요해 쓰지 않는다.
- **숫자와 막대**: 폭과 글자는 화면 그리는 쪽에서 못 움직인다. 300ms 동안만 자바스크립트로 움직인다.
- **색종이**: 조각 24개의 위치·회전·투명도를 화면 그리는 쪽에서 움직인다. 토스트처럼 뿌리 레이아웃에 자리(`CelebrateHost`)를 두고 `celebrate()`로 부른다. 눌림을 막지 않게 `pointerEvents="none"`이다.

## Project Structure

```text
frontend/src/
├── theme/motion.ts                          # 값 추가: 넓은 칸 눌림, 뼈대, 나타나기, 튀기, 색종이
├── components/ui/
│   ├── pressable-scale.tsx                  # 함수형 스타일, 넓은 칸
│   ├── skeleton.tsx (+test)                 # Skeleton, SkeletonList
│   ├── fade-in.tsx (+test)                  # 차례로 나타나기
│   ├── count-up.tsx (+test)                 # 굴러가는 숫자
│   ├── progress-bar.tsx (+test)             # 진행 막대
│   ├── pop.tsx (+test)                      # 톡 튀기
│   ├── celebrate.tsx (+test)                # 색종이
│   └── index.ts
├── app/_layout.tsx                          # CelebrateHost
└── features/**                              # 부품 바꿔 끼우기
```

## 단위 테스트로 증명할 것

- 눌림: 함수형 스타일이 눌림 상태로 풀린다, 넓은 칸은 0.98배다
- 뼈대: 줄 수만큼 그리고 progressbar로 읽힌다, 동작 줄이기에서는 움직임을 시작하지 않는다
- 나타나기: 순서에 따라 늦게 시작하고 8번째 뒤로는 더 늦추지 않는다
- 숫자: 처음에는 바로 보이고, 바뀌면 끝에 새 값이 된다, 동작 줄이기에서는 바로 바뀐다
- 막대: 처음에는 바로, 바뀌면 300ms 움직임을 시작한다
- 튀기: 처음에는 튀지 않고 값이 바뀌면 튄다
- 색종이: 부르면 조각이 보이고 끝나면 사라진다, 동작 줄이기에서는 나오지 않는다

## Complexity Tracking

적을 것이 없다.
