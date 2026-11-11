# Implementation Plan: 시험 데이터에 사진 넣기

**Branch**: `feature/EODI-289-mock-photos` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/20261111-104440-mock-photos/spec.md`

## Summary

테스트 모드에서 시험 데이터의 사진 주소를 공개 샘플 사진 주소로 바꿔 사진이 든 화면을 볼 수 있게 한다. 사진 주소를 화면용으로 바꾸는 공통 함수 한 곳에서 바꾸고, 시험 데이터에는 시험 사진 주소만 채운다. 공통 얼굴 부품은 사진을 못 받으면 글자 얼굴로 돌아간다.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, React Native 0.88 (Expo SDK 58)
**Primary Dependencies**: expo-image, `src/lib/asset-image.ts`, `src/components/ui/avatar.tsx`, 테스트 모드 가짜 서버 `src/api/dev-mock*.ts`
**Storage**: 없음
**Testing**: jest-expo + @testing-library/react-native
**Target Platform**: Android 우선, iOS, 웹(미리보기)
**Project Type**: 모바일 앱(Expo) — `frontend/src`
**Performance Goals**: 샘플 사진은 600×600으로 받아 목록에서 무겁지 않게 한다
**Constraints**: 다른 담당 화면 코드와 화면 규칙 코드는 고치지 않는다. 테스트 모드가 아니면 동작이 바뀌지 않는다. 새 의존성 없음
**Scale/Scope**: 새 파일 1개(+테스트), 공통 파일 2개, 시험 데이터 파일 2~3개

## Constitution Check

`.specify/memory/constitution.md`는 채우지 않은 틀이라 검사할 원칙이 없다. `frontend/CONVENTION.md`와 AGENTS.md 규칙을 지킨다. 새 의존성 없음, 끝내기 전에 lint·typecheck를 돌린다. 설계 뒤 다시 봐도 어긋나는 것이 없다.

## Project Structure

```text
specs/20261111-104440-mock-photos/
├── plan.md, research.md, quickstart.md, tasks.md
├── photo-check.md     # 칸마다 사진이 보이는지, 못 받았을 때 무엇이 보이는지 (구현 중에 채운다)
└── checklists/requirements.md

frontend/src/
├── lib/mock-photo.ts            # 새로: 시험 사진 주소 → 샘플 사진 주소
├── lib/asset-image.ts           # 테스트 모드에서 mock-photo를 먼저 본다
├── components/ui/avatar.tsx     # 사진을 못 받으면 글자 얼굴
└── api/dev-mock.ts, api/dev-mock-timeline.ts   # 다른 사람 프로필 사진, 타임라인 표지
```

## 단위 테스트로 증명할 것

- 같은 시험 사진 주소는 같은 샘플 주소, 다른 주소는 다른 샘플 주소가 된다
- 시험 사진이 아닌 주소(방금 올린 사진)는 바뀌지 않는다
- 테스트 모드가 아니면 `assetSource` 결과가 지금과 같다
- Avatar가 사진 받기에 실패하면 글자 얼굴을 그린다

## Complexity Tracking

적을 것이 없다.
