# Implementation Plan: 끊김 재기

**Branch**: `feature/EODI-299-jank-check` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/20261111-130000-jank-check/spec.md`

## Summary

움직임을 넣기 전 코드와 넣은 뒤 코드를 같은 휴대폰에서 같은 누름으로 재고, 결과를 `jank-report.md`에 적는다. 흔들림 범위를 벗어나게 늘어난 동작이 있으면 그곳의 움직임을 줄인다.

## Technical Context

**측정 도구**: 안드로이드의 화면 그리기 기록(`dumpsys gfxinfo`)과 자동 누름(`adb shell input tap`)
**대상**: 갤럭시 S22, 개발용 앱, 테스트 모드. 개발 서버는 `wt-fix-everyday` 작업 폴더에서 돌고, 그 폴더의 코드를 넣기 전·넣은 뒤로 바꿔 가며 잰다
**Constraints**: 앱 코드는 측정 결과가 줄이라고 할 때만 바꾼다. 배포용 빌드는 만들지 않는다

## Constitution Check

`.specify/memory/constitution.md`는 채우지 않은 틀이라 검사할 원칙이 없다.

## Research

- **무엇을 숫자로 삼나**: 끊긴 화면 비율(Janky frames)과 화면 한 장을 그리는 시간의 95번째·99번째 값. 휴대폰이 스스로 세므로 눈대중보다 낫다.
- **흔들림**: 같은 조건을 두 번 재서 범위를 본다. 개발용 앱은 1~2%p 흔들렸다.
- **코드 바꾸는 법**: 개발 서버가 도는 작업 폴더를 넣은 뒤 커밋으로 잠깐 바꾸고 앱을 새로 켠다. 끝나면 원래 브랜치로 되돌린다.
- **자동 누름의 위험**: 누르기 전에 앞에 뜬 앱이 우리 앱인지 확인해야 한다. 확인 없이 누르면 연결이 끊겼을 때 다른 앱을 누른다(2026-11-11에 실제로 생겼다).

## Project Structure

```text
specs/20261111-130000-jank-check/
├── spec.md, plan.md, tasks.md
└── jank-report.md      # 측정 기록과 판단
```

## Complexity Tracking

적을 것이 없다.
