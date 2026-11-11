# Tasks: 기능 잇기

**Input**: Design documents from `specs/20261111-124000-publish-links/`

경로는 `frontend/` 기준이다.

## Phase 1: Setup

- [x] T001 Jira EODI-298과 브랜치 `feature/EODI-298-publish-links`를 만든다. 7번 주제 브랜치 위에 쌓는다
- [x] T002 게시 확인 시트가 어느 화면에 있는지 찾는다: 내 여행 기록 `/trips/[tripId]/record`

## Phase 2: User Story 1 - 여행 화면에서 게시하러 간다 (P1)

- [x] T003 [US1] `src/features/trip/trip-routes.ts`에 `publishHref`를 더하고 피드 단계도 같은 주소로 보낸다. `src/features/trip/trip-routes.test.ts`를 고친다 (FR-003)
- [x] T004 [US1] `src/features/trip/components/trip-menu-grid.tsx`의 게시 메뉴와 `src/features/trip/screens/trip-detail-screen.tsx`의 [피드로 게시]를 잇는다. `src/features/trip/components/trip-menu-grid.test.tsx`를 고친다 (FR-001, FR-002)

## Phase 3: Polish

- [x] T005 전체 `npx jest`, `npx tsc --noEmit`, `npx expo lint`를 통과시킨다
- [ ] T006 사용자 몫: 휴대폰에서 다녀온 여행의 [피드로 게시]와 게시 메뉴를 눌러 기록 화면이 열리는지 본다

## Phase 4: Convergence

2026-11-11에 spec·plan·tasks와 코드를 대조했다. 빠진 것이 없어 더할 작업이 없다.

## 넘긴 것 (다른 담당 화면)

- 저장 탭의 "그룹 즐겨찾기"를 여행별 그룹 즐겨찾기로 잇기
- 친구 화면의 팔로잉·팔로워 숫자 모양 고치기
- 마이페이지의 "친구에게 보이는 모습" 버튼 빼기
- 게시 버튼에서 게시 확인 시트를 바로 띄우기(내 여행 기록 화면이 값을 받아야 한다)
