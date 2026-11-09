# Implementation Plan: 코스 함께 편집

**Branch**: `feature/EODI-236-course-coedit` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

## Summary

코스 짜기(S23)에 함께 편집 규칙을 더한다. 저장이 409로 거절되거나 공유 실시간 연결이 다시 연결되면 최신 코스를 받아, 편집을 시작한 처음 코스와 비교해 누가 어느 날을 고쳤는지 가린다. 서로 다른 날이면 최신 코스에 내 날만 다시 얹고 안내하며, 같은 날이면 Figma 201-13453 확인 상자를 띄운다. 실시간 코스 이벤트는 규격이 없어 구독하지 않는다(Q-8-1).

## Technical Context

**Language/Version**: TypeScript 5, React 19, React Native 0.88, Expo SDK 58
**Primary Dependencies**: expo-router, TanStack Query v5, zustand(공유 연결 상태), 기존 src/components/ui, src/realtime
**Storage**: 없음. 처음 코스는 화면 상태로 기억한다
**Testing**: jest-expo, @testing-library/react-native
**Target Platform**: Android·iOS 앱, 웹 미리보기
**Project Type**: mobile app
**Performance Goals**: 다시 연결 뒤 3초 안에 최신 코스 비교(SC-003)
**Constraints**: 이벤트 형식을 지어내지 않는다. 저장 규칙(날짜별 순서, 인접 쌍마다 구간 하나)을 깨지 않는다
**Scale/Scope**: 코스 항목 200개까지, 한 화면

## Constitution Check

constitution이 비어 있는 틀이라 frontend/CONVENTION.md를 기준으로 본다.
- 화면 밖 코드는 src/features/course 아래, 라우트는 src/app 아래만: 지킴
- 순수 규칙은 함수로 분리하고 단위 테스트: coedit-rules.ts
- 공통 부품 재사용: 확인 상자는 화면 모양이 Figma 가운데 상자라 course 안에 작게 만들고 Button, Avatar를 쓴다

## Project Structure

```text
src/features/course/
  coedit-rules.ts            # 고친 날 찾기, 합치기, 덮기(순수)
  coedit-rules.test.ts
  hooks/use-reconnected.ts   # 공유 연결이 끊겼다 다시 연결되는 순간 알림
  hooks/use-save-itinerary.ts  # 409 결과에서 안내를 빼고 화면이 정하게
  components/coedit-conflict.tsx  # 201-13453 확인 상자
  components/coeditor-strip.tsx   # 편집 중 동행 줄(Q-8-5)
  screens/course-edit-screen.tsx  # 처음 코스 기억, 충돌·다시 연결 처리
src/app/dev/course-coedit.tsx     # 미리보기
src/api/dev-mock-course.ts        # editByOther에 일차 고르기
```

## Phases

- Phase 0: [research.md](./research.md)
- Phase 1: [data-model.md](./data-model.md), [contracts/routes.md](./contracts/routes.md), [quickstart.md](./quickstart.md)
