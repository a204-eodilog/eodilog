# Implementation Plan: 스낵바와 토스트 나누기

**Branch**: `feature/EODI-295-snackbar-toast` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/20261111-113500-snackbar-toast/spec.md`

## Summary

짧은 안내를 두 모양으로 나눈다. 버튼이 있거나 실패거나 글이 길면 화면 위에서 내려오는 스낵바, 아니면 화면 아래에서 서서히 나타나는 토스트다. 부르는 코드는 그대로 두고 공통 안내 부품 안에서 가른다.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, React Native 0.88 (Expo SDK 58)
**Primary Dependencies**: sonner-native 0.27(자리 나누기 `toasterId`), react-native-reanimated(들어오고 나가는 움직임), react-native-safe-area-context
**Testing**: jest-expo. 가르는 규칙은 순수 함수 단위 테스트
**Target Platform**: Android 우선, iOS, 웹(미리보기)
**Constraints**: 부르는 곳 235곳을 바꾸지 않는다. 새 의존성 없음
**Scale/Scope**: 공통 파일 1개 수정, 규칙 파일 1개(+테스트)

## Constitution Check

`.specify/memory/constitution.md`는 채우지 않은 틀이라 검사할 원칙이 없다. `frontend/CONVENTION.md`와 AGENTS.md 규칙을 지킨다.

## Research

- **자리를 둘로 나누는 방법**: sonner-native는 `<Toaster id="...">`를 여러 개 두고 안내마다 `toasterId`로 보낼 자리를 고를 수 있다. 이름 없는 자리가 기본이다.
  - **Decision**: 기본 자리를 스낵바(위, 내려옴, 위로 밀어 닫기, 4초)로 두고, `toast`라는 자리를 토스트(아래, 서서히, 2초)로 더한다.
  - **Alternatives considered**: 토스트를 직접 만들기 — 쌓임과 닫힘을 다시 만들어야 한다.
- **가르는 규칙을 어디에 두나**: `toast-rules.ts`의 순수 함수 `toastKind`, `toastPlacement`. 공통 안내 부품은 reanimated를 불러와 jest에서 직접 불러올 수 없으므로, 규칙을 따로 빼야 테스트할 수 있다.
- **실패인데 기본으로 부르는 안내**: 내 화면에만 40곳쯤 있고 테스트가 그 부르기를 확인한다. 부르는 코드를 바꾸지 않기로 했으므로 글 길이(20자)로 가른다(Q-17-1).
- **토스트 높이**: 탭 바 높이 64와 안전 영역 아래 여백, 간격 8을 더한 만큼 띄운다.

## Project Structure

```text
frontend/src/components/ui/
├── toast-rules.ts (+test)   # 새로: 스낵바·토스트 가르기, 자리와 보이는 시간
└── toast.tsx                # 자리 둘, 토스트의 서서히 나타나고 사라지는 움직임
```

## 단위 테스트로 증명할 것

- 짧은 확인은 토스트, 버튼이 있으면 스낵바, 실패는 스낵바, 20자 이상이면 스낵바
- 스낵바는 기본 자리에 4초, 토스트는 아래 자리에 2초

## Complexity Tracking

적을 것이 없다.
