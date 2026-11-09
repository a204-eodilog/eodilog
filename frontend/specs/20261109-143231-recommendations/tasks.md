# Tasks: 추천 결과

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md), [contracts/routes.md](./contracts/routes.md)

**Tests**: 순수 규칙은 jest, 화면은 RNTL. 단계마다 `npx jest src/features/recommend`, `npx tsc --noEmit`, `npx eslint` 통과 뒤 체크한다.

## Phase 1: Foundational

- [ ] T001 [P] 추천 타입과 API requestRecommendation, getRecommendation을 src/features/recommend/types.ts, api.ts에 만든다
- [ ] T002 [P] 항목 나누기, 근거 칸 문구, 생성 중 단계, 상태 판정 규칙을 src/features/recommend/recommend-rules.ts에 만들고 recommend-rules.test.ts로 증명한다
- [ ] T003 [P] 테스트 모드 가짜 서버 src/api/dev-mock-recommend.ts를 만들고 dev-mock.ts에 연결한다. failNext, insufficientNext 조작
- [ ] T004 작업을 만들고 1.5초마다 확인하며 2분이면 실패, 화면을 나가면 멈추는 useRecommendation을 src/features/recommend/hooks/use-recommendation.ts에 만들고 가짜 시계 테스트를 둔다. 예시 데이터 testing.ts도 둔다

## Phase 2: User Story 1 - 추천 받고 결과 보기 (P1)

- [ ] T005 [P] [US1] 생성 중 화면 RecommendLoading을 components/recommend-loading.tsx에 만든다(201-10044)
- [ ] T006 [P] [US1] 이번 추천에 쓴 것 BasisCard와 추천 카드 RecommendCard를 components에 만든다(201-10081)
- [ ] T007 [US1] RecommendView와 RecommendScreen, 라우트 src/app/(main)/trips/[tripId]/recommend.tsx를 만들고 묶음 칩 스크롤, 화면 테스트를 둔다
- [ ] T008 [US1] 미리보기 src/app/dev/recommend.tsx에 loading, success 상태

## Phase 3: User Story 2 - 결과로 다음 행동 (P1)

- [ ] T009 [US2] [담기]를 그룹 즐겨찾기 담기에 연결해 '담김'을 보이고, [투표 후보로]는 준비 중 안내, [재추천]은 새 작업. 화면 테스트

## Phase 4: User Story 3 - 추천할 수 없을 때 (P2)

- [ ] T010 [US3] 자료 부족, 생성 실패, 겹침 없음 화면을 components/recommend-states.tsx에 만들어 연결하고 테스트와 미리보기 no-overlap, insufficient, failed를 더한다

## Phase 5: User Story 4 - 들어가기 (P3)

- [ ] T011 [US4] 취향이 비었으면 S03 추천 직전으로 보내고 돌아오면 시작한다. 화면 테스트
- [ ] T012 [US4] S17 '추천' 메뉴와 S20 [추천 받기], 장소 없음 [추천 받기]를 S21로 연결하고 테스트를 src/features/recommend/recommend-entry.test.tsx에 둔다

## Phase 6: Polish

- [ ] T013 전체 테스트·타입·린트, 미리보기 Figma 비교, 테스트 모드 흐름
- [ ] T014 spec 상태와 quickstart 정리
- [ ] T015 사용자 몫: 추천 백엔드가 생기면 로컬 백엔드 + 웹 확인
- [ ] T016 사용자 몫: 안드로이드 기기 확인

## Dependencies

- T001~T003 병렬. T004는 T001 뒤. T007은 T004~T006 뒤. T009~T012는 T007 뒤.
