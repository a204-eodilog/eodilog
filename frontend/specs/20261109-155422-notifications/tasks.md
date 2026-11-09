# Tasks: 인앱 알림

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md), [contracts/routes.md](./contracts/routes.md)

## Phase 1: Setup

- [X] T001 명세 문서 묶음 추가 specs/20261109-155422-notifications/

## Phase 2: Foundational

- [X] T002 [P] 알림 타입과 API를 만든다 src/features/notification/types.ts, src/features/notification/api.ts
- [X] T003 [P] 종류 표·제목·시각·오늘/이전 묶기·대상 주소·팝업 고르기·투표 팝업 문구 규칙과 jest 테스트 src/features/notification/notification-rules.ts, notification-rules.test.ts
- [X] T004 [P] 테스트·미리보기 예시와 쿼리 키 src/features/notification/testing.ts, src/features/notification/hooks/notification-keys.ts
- [X] T005 테스트 모드 가짜 알림 서버와 연결 src/api/dev-mock-notification.ts, src/api/dev-mock.ts

## Phase 3: US1 알림 목록 (P1)

- [X] T006 [US1] 목록 무한 받기·모두 읽음·지우기 훅 src/features/notification/hooks/use-notifications.ts
- [X] T007 [P] [US1] 알림 줄 부품 src/features/notification/components/notification-row.tsx
- [X] T008 [P] [US1] 없음·실패·볼 수 없음 부품 src/features/notification/components/notification-states.tsx
- [X] T009 [US1] S49 목록 화면, 주소, RNTL 테스트 src/features/notification/screens/notifications-screen.tsx(+test), src/app/(main)/notifications/index.tsx

## Phase 4: US2 열기와 읽음 (P1)

- [X] T010 [US2] 읽음 + 여행 확인 + 이동 훅, 두 번 눌러도 한 번, 테스트 src/features/notification/hooks/use-open-notification.ts(+test)
- [X] T011 [US2] 목록 화면에 열기 연결 src/features/notification/screens/notifications-screen.tsx
- [X] T012 [US2] 볼 수 없음 화면, 주소, 테스트 src/features/notification/screens/notification-gone-screen.tsx(+test), src/app/(main)/notifications/gone.tsx
- [X] T013 [US2] 홈 종 아이콘을 목록으로 연결 src/features/home/screens/home-screen.tsx

## Phase 5: US3 팝업 (P1)

- [X] T014 [P] [US3] 모아 보기·투표 시작 팝업 모양 src/features/notification/components/notification-popup.tsx
- [X] T015 [US3] 실행·복귀 때 팝업을 띄우는 자리와 테스트 src/features/notification/screens/popup-host.tsx(+test)
- [X] T016 [US3] 로그인한 화면 묶음에 팝업 자리 추가 src/app/(main)/_layout.tsx

## Phase 6: Polish

- [ ] T017 /dev/notifications 미리보기 6개 상태 src/app/dev/notifications.tsx
- [ ] T018 웹 미리보기에서 Figma 6개 상태와 실제 흐름 확인
- [ ] T019 사용자 몫: 로컬 백엔드 + 웹 실서버 확인
- [ ] T020 사용자 몫: 안드로이드 기기 확인

## Dependencies

T002·T003·T004 → T005 → US1 → US2 → US3 → Polish. US3 팝업은 US2의 열기 훅을 쓴다.
