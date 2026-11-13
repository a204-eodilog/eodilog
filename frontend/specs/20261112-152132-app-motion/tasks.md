# Tasks: 앱 전체 움직임과 효과

**Input**: Design documents from `specs/20261112-152132-app-motion/`

경로는 `frontend/` 기준이다.

## Phase 1: Setup

- [x] T001 Jira EODI-333과 브랜치 `feature/EODI-333-app-motion`을 최신 dev에서 만든다
- [x] T002 `src/theme/motion.ts`에 값을 더한다: 넓은 칸 눌림, 뼈대, 나타나기, 튀기, 색종이 (FR-013)

## Phase 2: User Story 1 - 누르면 반응한다 (P1)

- [x] T003 [US1] `src/components/ui/pressable-scale.tsx`가 함수형 스타일을 받고 넓은 칸을 덜 줄이게 하고 `src/components/ui/motion.test.tsx`에 테스트를 더한다 (FR-002, FR-003)
- [x] T004 [US1] `src/features/**`의 `<Pressable`을 `<PressableScale`로 바꾸고 import를 고친다 (FR-001)

## Phase 3: User Story 2 - 기다리는 동안 뼈대가 보인다 (P1)

- [x] T005 [P] [US2] `src/components/ui/skeleton.tsx`와 `skeleton.test.tsx`를 만든다 (FR-004, FR-005, FR-012)
- [x] T006 [P] [US2] `src/components/ui/fade-in.tsx`와 `fade-in.test.tsx`를 만든다 (FR-006, FR-012)
- [x] T007 [US2] `src/features/**`의 화면 전체 로딩 동그라미를 `SkeletonList`로 바꾼다 (FR-004)
- [x] T008 [US2] 주요 목록의 줄을 `FadeIn`으로 감싼다: 여행 목록(다음 계획), 대화방 목록, 알림, 그룹 즐겨찾기, 저장, 경비, 내 여행 기록, 요즘 뜨는 여행지 (FR-006)

## Phase 4: User Story 3 - 값이 바뀌는 것이 보인다 (P2)

- [x] T009 [P] [US3] `src/components/ui/progress-bar.tsx`와 테스트를 만든다 (FR-007)
- [x] T010 [P] [US3] `src/components/ui/count-up.tsx`와 테스트를 만든다 (FR-008)
- [x] T011 [P] [US3] `src/components/ui/pop.tsx`와 테스트를 만든다 (FR-009)
- [x] T012 [US3] 막대를 바꾼다: `src/features/checklist/components/checklist-progress.tsx`, `src/features/on-trip/components/before-start.tsx`, `src/features/photo/components/photo-upload-view.tsx`, `src/features/poll/components/candidate-row.tsx` (FR-007)
- [x] T013 [US3] 숫자와 배지를 바꾼다: 투표 표 수, 준비물 진행 숫자, 홈 알림 배지 (FR-008, FR-009)

## Phase 5: User Story 4 - 기쁜 순간을 축하한다 (P3)

- [x] T014 [US4] `src/components/ui/celebrate.tsx`와 테스트를 만들고 `src/app/_layout.tsx`에 자리를 둔다 (FR-010, FR-012)
- [x] T015 [US4] 여행 만들기 완료, 초대로 참여, 준비물 모두 챙김에서 부른다 (FR-011)

## Phase 6: Polish

- [x] T016 `src/components/ui/index.ts`에 새 부품을 내보내고 `/dev/ui`에 보이게 한다
- [x] T017 전체 `npx jest`, `npx tsc --noEmit`, `npx expo lint`를 통과시킨다 (SC-004)
- [ ] T018 휴대폰에서 눌림, 뼈대, 막대, 색종이를 보고 홈 시트 끊김을 넣기 전과 견준다 (SC-005). 2026-11-12에는 휴대폰 앱이 다른 작업의 개발 서버에 붙어 있어 하지 못했다. 웹 미리보기(/dev/ui, /trips)에서 그려지는 것과 숫자·막대·색종이가 움직이는 것만 확인했다
- [ ] T019 사용자 몫: 휴대폰에서 느낌을 확인한다

## Phase 6-2: 나타나는 움직임을 다이나믹하게 (2026-11-12 사용자 요청)

- [x] T020 `src/theme/motion.ts`의 나타나기 값을 키운다: 420ms, 끝에서 넘쳤다 돌아오는 곡선, 올라오는 높이 28, 옆에서 44, 통 커지기 0.8배, 간격 60ms (FR-014)
- [x] T021 `src/components/ui/fade-in.tsx`에 방향 다섯 가지(up, left, right, pop, mask)와 `useAppear`를 만든다 (FR-014)
- [x] T022 공통 부품이 스스로 나타나게 한다: `stagger.tsx`(시트·팝업·빈 화면의 글), `card.tsx`(누르지 않는 카드), `header.tsx`(큰 제목) (FR-015)
- [x] T023 `src/components/ui/pressable-scale.tsx`에 `appear`를 더해 감싸는 칸 없이 스스로 나타나게 하고, 목록을 그리는 자리 10곳에 준다(여행 메뉴 타일, 홈 추천 카드, 로그인 버튼 등) (FR-006)
- [x] T024 목록을 그리는 자리 11곳의 줄을 `FadeIn`으로 감싼다(준비물, 추천 카드, 알림 팝업, 방문 기록 등). 다녀온 여행 카드는 옆에서 들어온다 (FR-006)
- [x] T025 `src/features/trip/components/trip-hero.tsx`의 여행 이름·큰 제목·날짜가 옆에서, 틀 아래에서, 통 커지며 차례로 나타나게 한다 (FR-014)

## Phase 7: Convergence

2026-11-12에 spec·plan·tasks와 코드를 대조했다.

- FR-001: `src/features/**`의 화면 코드(테스트 제외)에 `<Pressable`이 남지 않았다(220곳을 바꿨다).
- FR-004: 화면 전체 로딩 38곳을 뼈대로 바꿨다. 아래 "넘긴 것"의 세 곳은 동그라미로 남겼다.
- FR-006 ~ FR-012: 부품과 적용한 자리가 있고 `src/components/ui/effects.test.tsx`가 증명한다.
- 빠진 코드 작업이 없어 더할 작업이 없다. 남은 것은 휴대폰 확인(T018, T019)이다.

## 넘긴 것

- 새 부품은 화면에서 `@/components/ui/pressable-scale`처럼 제 파일에서 가져온다. 화면 테스트 32개가 `@/components/ui` 묶음을 통째로 흉내 내서, 묶음에서 가져오면 테스트에서 부품이 비어 버린다.
- 화면 전체 로딩이지만 동그라미로 남긴 곳: 초대 확인(목록이 아니라 카드 한 장이다), 카카오 로그인 돌아오는 화면(잠깐 지나가는 화면이다), 날씨 대안 찾는 중(무엇을 하는지 글이 같이 나온다).
- 밀어서 지우기, 끌어서 순서 바꾸기, 카드 사진이 상세로 이어지기, 스크롤에 접히는 머리글, 채팅 말풍선 나타나기는 넣지 않았다(Q-333-4, Q-333-5).
- 북마크·좋아요가 톡 튀는 것은 넣지 않았다. 지금 화면에 켜고 끄는 북마크·좋아요 아이콘이 없다. 톡 튀기는 홈 알림 배지에만 넣었다.
