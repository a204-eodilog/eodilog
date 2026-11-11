# Tasks: 시험 데이터에 사진 넣기

**Input**: Design documents from `specs/20261111-104440-mock-photos/`

경로는 `frontend/` 기준이다.

## Phase 1: Setup

- [x] T001 Jira EODI-289와 브랜치 `feature/EODI-289-mock-photos`를 만든다. 1번 주제 브랜치 위에 쌓는다
- [x] T002 사진 칸을 조사해 `research.md` R1 표에 적는다

## Phase 2: Foundational

- [ ] T003 [P] `src/lib/mock-photo.test.ts`에 테스트를 쓴다: 같은 주소는 같은 결과, 다른 주소는 다른 결과, 시험 사진이 아니면 null, 자산 id를 주소에서 꺼낸다
- [ ] T004 `src/lib/mock-photo.ts`에 `mockPhotoUrl`을 만들어 T003을 통과시킨다 (FR-001~003, FR-005)
- [ ] T005 `src/lib/asset-image.test.ts`에 테스트 모드와 아닐 때의 `assetSource` 테스트를 쓰고, `src/lib/asset-image.ts`가 테스트 모드에서 `mockPhotoUrl`을 먼저 보게 한다 (FR-004)

## Phase 3: User Story 1 - 테스트 모드에서 사진이 든 화면을 본다 (P1)

- [ ] T006 [US1] `src/api/dev-mock.ts`의 `user()`가 다른 사람 절반쯤에 시험 프로필 사진 주소를 넣게 한다. 나는 비운다 (FR-007, FR-008)
- [ ] T007 [US1] 타임라인 요약 표지와 피드 목록의 사진이 시험 사진 주소를 갖는지 확인하고 빈 곳을 `src/api/dev-mock*.ts`에서 채운다 (FR-006)
- [ ] T008 [US1] 웹 미리보기에서 여행 사진, 피드 상세, 얼굴 사진이 보이는지 확인한다

## Phase 4: User Story 2 - 사진이 없거나 못 받아도 화면이 깨지지 않는다 (P2)

- [ ] T009 [US2] `src/components/ui/avatar.test.tsx`에 사진 받기 실패면 글자 얼굴이 되는 테스트를 쓰고 `src/components/ui/avatar.tsx`를 고친다 (FR-009)
- [ ] T010 [US2] 사진을 못 받게 하고 칸마다 무엇이 보이는지 `specs/20261111-104440-mock-photos/photo-check.md`에 적는다 (FR-010)

## Phase 5: Polish

- [ ] T011 전체 `npx jest`, `npx tsc --noEmit`, `npx expo lint`를 통과시킨다
- [ ] T012 사용자 몫: 휴대폰 테스트 모드에서 quickstart의 눌러 보기를 확인한다

## Dependencies

- T004 → T005 → T006~T008. T009는 다른 파일이라 따로 할 수 있다.
