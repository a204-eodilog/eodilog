# Tasks: 스낵바와 토스트 나누기

**Input**: Design documents from `specs/20261111-113500-snackbar-toast/`

경로는 `frontend/` 기준이다.

## Phase 1: Setup

- [x] T001 Jira EODI-295와 브랜치 `feature/EODI-295-snackbar-toast`를 만든다. 4번 주제 브랜치 위에 쌓는다
- [x] T002 안내를 부르는 곳을 세고 종류를 나눈다: 235곳, 실패 53, 버튼 8

## Phase 2: Foundational

- [x] T003 [P] `src/components/ui/toast-rules.test.ts`에 가르는 규칙 테스트를 쓴다
- [x] T004 `src/components/ui/toast-rules.ts`에 `toastKind`, `toastPlacement`를 만든다 (FR-001~FR-004)

## Phase 3: User Story 1·2

- [x] T005 [US1] `src/components/ui/toast.tsx`에 토스트 자리(아래, 서서히, 2초)를 더한다 (FR-006)
- [x] T006 [US2] `src/components/ui/toast.tsx`의 기본 자리를 스낵바(위, 내려옴, 4초)로 두고, 부르기 세 가지가 규칙에 따라 자리를 고르게 한다 (FR-005, FR-007)

## Phase 4: Polish

- [x] T007 전체 `npx jest`, `npx tsc --noEmit`, `npx expo lint`를 통과시키고, 웹 미리보기에서 "준비 중이에요"가 화면 아래에 뜨는 것을 확인한다
- [ ] T008 사용자 몫: 휴대폰에서 토스트가 탭 바 위에 뜨는지, 스낵바가 위에서 내려오고 위로 밀어 닫히는지, 둘이 같이 떠도 가리지 않는지 본다

## Phase 5: Convergence

2026-11-11에 spec·plan·tasks와 코드를 대조했다.

- [x] T009 실패나 충돌을 알리는데 기본으로 부르는 안내가 토스트로 가지 않게 글 길이 규칙을 더한다 per FR-003 (partial)
