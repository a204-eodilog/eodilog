# Tasks: 여행 중과 날씨 대안

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md), [contracts/routes.md](./contracts/routes.md)

**Tests**: 순수 규칙은 jest, 화면은 RNTL. 단계마다 `npx jest src/features/on-trip`, `npx tsc --noEmit`, `npx eslint` 통과 뒤 체크한다.

## Phase 1: Foundational

- [X] T001 [P] 날씨 타입과 API(날씨, 날씨 대안, WEATHER 변경안, 준비물 요약·추가)를 src/features/on-trip/types.ts, api.ts에 만든다
- [X] T002 [P] 여행 단계, 날씨 문구, 비 그침, 관측·예보, 비 영향 일정, 다음 일정, 대안 줄 규칙을 on-trip-rules.ts에 만들고 테스트로 증명한다. 예시 데이터 testing.ts
- [X] T003 [P] 테스트 모드 가짜 서버 src/api/dev-mock-weather.ts를 만들고 dev-mock.ts에 연결한다
- [X] T004 [P] 날씨 아이콘(우산, 비구름, 해, 구름, 구름 끊김, 가방, 번개)을 src/components/ui/icon.tsx에 더한다

## Phase 2: User Story 1 - 여행 중 오늘 보기 (P1)

- [X] T005 [US1] 날씨 조회 useWeather와 준비물 요약 useChecklistSummary 훅
- [X] T006 [P] [US1] 날씨 카드 WeatherCard(보통·갱신 실패), 도구 칸 TripTools, 오늘 코스 TodayCourse 부품
- [X] T007 [US1] OnTripView와 OnTripScreen, 라우트 today.tsx, 여행 중·코스 없음·날씨 갱신 실패 화면 테스트, S17 '여행 중' 연결

## Phase 3: User Story 2 - 여행 시작 전 (P2)

- [X] T008 [US2] 시작 전 BeforeStart(남은 날, 바뀌는 날 카드, 날짜별 예보, 준비물 진행)와 화면 연결, 테스트

## Phase 4: User Story 3 - 날씨 대안 (P1)

- [X] T009 [US3] 날씨 대안 작업과 WEATHER 변경안 작업 useWeatherAlternatives 훅과 가짜 시계 테스트
- [X] T010 [US3] 대안 목록 AlternativeList, 결과 시트 ProposalSheet, 대안 없음 NoAlternative 부품
- [X] T011 [US3] WeatherView와 WeatherScreen, 라우트 weather.tsx, 기본·반영 뒤·대안 없음·날씨 갱신 실패 화면 테스트

## Phase 5: Polish

- [X] T012 미리보기 src/app/dev/on-trip.tsx 8개 상태
- [X] T013 전체 테스트·타입·린트, 미리보기 Figma 비교, 테스트 모드 흐름
- [X] T014 spec 상태와 quickstart 정리
- [ ] T015 사용자 몫: 날씨 백엔드가 생기면 로컬 백엔드 + 웹 확인
- [ ] T016 사용자 몫: 안드로이드 기기 확인

## Phase 6: Review 1

- [X] T017 비의 영향을 받는 일정은 오늘이면 지금 이후 일정만 고르도록 affectedIndex에 지금 시각을 받게 하고 S25, S26에 넘긴다. 테스트를 더한다

## Phase 7: Review 2

- [X] T018 테스트 모드 날씨 대안이 늘 1일차 해운대를 대상으로 해 다른 날에는 결과 시트의 이전·이후 일정이 비었다. 요청한 장소의 코스 항목으로 대안을 만들도록 dev-mock-weather와 dev-mock-course를 고친다

## Phase 8: Review 3

- [X] T019 영향 받는 일정 줄의 장소 이름이 빨간 표시 때문에 잘린다. 두 줄까지 보이게 AffectedRow를 고친다
