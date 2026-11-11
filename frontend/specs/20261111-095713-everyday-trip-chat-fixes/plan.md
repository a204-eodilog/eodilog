# Implementation Plan: 여행·채팅 일상 문제 고치기

**Branch**: `fix/EODI-285-everyday-trip-chat` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/20261111-095713-everyday-trip-chat-fixes/spec.md`

## Summary

새 화면 없이 네 가지를 고친다. 이미 동행인 여행의 초대 링크에서 자동 참여가 실패하면 빠져나올 길을 준다. 빈 대화방도 이어 받기와 마지막 메시지 확인이 돌게 한다. 대화방 목록의 누름을 한 번만 받는다. 여행 메뉴 네 개를 시험 데이터의 모든 여행에서 눌러 원인을 기록하고 내 담당 원인을 고친다. 2026-11-09와 11-10에 먼저 고쳐 둔 변경(파일 49개)은 요구사항과 맞는지 확인하고 묶음별로 커밋한다.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, React Native 0.88 (Expo SDK 58)
**Primary Dependencies**: expo-router(typed routes, `useFocusEffect`), @tanstack/react-query v5(`onlineManager`, mutation networkMode), axios(`src/api/client`), `src/components/ui`
**Storage**: 서버 상태는 TanStack Query 캐시. 채팅 메시지 창은 `chatMessagesKey` 캐시
**Testing**: jest-expo + @testing-library/react-native + expo-router/testing-library. 새로 고칠 것마다 실패하는 테스트를 먼저 쓴다
**Target Platform**: Android 우선, iOS, 웹(미리보기·테스트 모드)
**Project Type**: 모바일 앱(Expo) — `frontend/src`
**Performance Goals**: 빈 대화방의 마지막 메시지 확인은 지금과 같이 15초에 요청 1번. 앱 복귀 때 대화방 목록 요청 1번
**Constraints**: 백엔드·DB는 바꾸지 않는다. 평가·경비 화면 코드는 고치지 않는다. 초대 확인 화면은 다른 담당이라 실패 안내를 더하는 최소 변경만 한다. 새 의존성 없음
**Scale/Scope**: 고치는 파일 5개 안팎(chat-inbound, chat-rooms-screen, invite-screen, 새 훅 1개, 시험 데이터) + 먼저 고쳐 둔 파일 49개 커밋

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

`.specify/memory/constitution.md`는 채우지 않은 틀이라 검사할 원칙이 없다. 대신 `frontend/CONVENTION.md`와 AGENTS.md 규칙을 지킨다.

- 화면 밖 코드는 `src/features/*`, `src/hooks`, `src/lib`에 둔다 — 지킴
- 공통 부품·토큰을 쓰고 새 의존성을 더하지 않는다 — 지킴
- 끝내기 전에 lint·typecheck를 돌린다 — tasks에 넣음

설계 뒤 다시 봐도 어긋나는 것이 없다.

## Project Structure

### Documentation (this feature)

```text
specs/20261111-095713-everyday-trip-chat-fixes/
├── plan.md
├── research.md        # 원인과 고치는 방법
├── data-model.md      # 메시지 창과 초대 화면 상태
├── quickstart.md      # 확인하는 법
├── menu-check.md      # 여행 메뉴 네 개 조사 기록 (구현 중에 채운다)
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
frontend/src/
├── hooks/use-open-once.ts                         # 새로: 화면을 여는 누름을 한 번만 받는다
├── features/chat/chat-inbound.ts                  # 빈 창의 이어 받기·마지막 메시지 확인
├── features/chat/screens/chat-rooms-screen.tsx    # 대화방 열기에 use-open-once
├── features/invitation/screens/invite-screen.tsx  # 자동 참여 실패 안내 (다른 담당 화면, 최소 변경)
└── api/dev-mock*.ts                               # 조사에서 시험 데이터가 원인으로 나오면 고친다
```

**Structure Decision**: 기존 폴더 구조를 그대로 쓴다. 새 파일은 훅 하나와 테스트뿐이다.

## 단위 테스트로 증명할 것

- 빈 창에서 이어 받기를 하면 요청이 1번 나가고 그사이 온 메시지가 창에 들어온다 (고치기 전: 요청 0번)
- 빈 창의 마지막 메시지 확인이 메시지를 찾아 창에 넣는다 (고치기 전: 건너뜀)
- 빈 방에서 받은 메시지 3개가 순서대로 3개 보인다
- 같은 방을 연달아 두 번 눌러도 화면 이동은 1번이다. 다른 방을 눌러도 처음 방만 열린다. 돌아오면 다시 열 수 있다
- 자동 참여가 실패하면 "이동하는 중"이 사라지고 [다시 시도], [홈으로]가 보인다. 다시 시도가 성공하면 여행으로 간다

## Complexity Tracking

어긋나는 원칙이 없어 적을 것이 없다.
