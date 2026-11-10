# Implementation Plan: 인앱 알림

**Branch**: `feature/EODI-244-notifications` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

## Summary

S49 알림 목록(기본·없음·실패·볼 수 없음)과 S48 앱 실행·복귀 팝업(모아 보기·투표 시작)을 만든다. 서버 알림 API를 그대로 부르고, 테스트 모드 가짜 서버가 알림 목록·읽음·지우기·요약을 흉내 낸다. 홈 종 아이콘은 목록으로 가는 한 줄만 바꾼다.

## Technical Context

**Language/Version**: TypeScript 5, React Native 0.88, Expo SDK 58

**Primary Dependencies**: expo-router(타입 있는 주소), TanStack Query v5(useInfiniteQuery), src/components/ui(Header, Button, EmptyState·ErrorState, Icon, toast), src/theme 토큰

**Testing**: jest-expo, @testing-library/react-native

**Target Platform**: Android·iOS, 웹 미리보기

**Constraints**: 푸시 없음, 실시간 구독 목적지 없음. 다른 브랜치 화면은 주소 문자열로만 연결.

## Constitution Check

- 기능 코드는 `src/features/notification/`, 주소 파일은 `src/app/(main)/notifications/`에만 둔다. 통과.
- 순수 규칙(묶기, 시각, 종류 표, 대상 주소, 팝업 고르기)을 `notification-rules.ts`로 빼고 jest로 증명한다. 통과.
- 다른 담당 화면(홈)은 종 연결 한 줄만. 통과.

## Research

- **R1 대상 주소**: POLL → `/trips/{tripId}/polls/{pollId}`, TRIP → `/trips/{id}`, ITINERARY → `/trips/{id}/course`, USER + FOLLOW_REQUESTED → `/friends`, USER + 그 밖 → `/users/{id}`, PROPOSAL → `/trips/{tripId}/proposal?jobId={id}`. 투표·코스·변경안 주소는 다른 브랜치에 있어 `Href`로 바꿔 넘긴다. 여행 번호가 필요한데 없으면 여행 탭(`/trips`). 대안: 투표 주소만 받는 새 화면 → 서버 조회 API가 없어 버림.
- **R2 열기 전 확인**: 여행이 있는 대상은 `getTrip`을 `tripKey`로 받아 본다. 404·403이면 볼 수 없음. 그 밖 오류는 그냥 이동해 대상 화면이 스스로 안내하게 둔다.
- **R3 팝업 때**: `(main)/_layout.tsx`에 팝업 자리 하나를 두고, 처음 그릴 때와 AppState가 active로 돌아올 때 `unreadOnly=true&limit=20`을 받는다. 이미 보여 준 번호는 모듈 안 Set에 둔다(앱 실행 동안). 대안: 홈에서만 → 흐름 문서가 "어느 탭에서든"이라 버림.
- **R4 나간 여행 표시**: 내 여행 전체 목록(`['me','trips']`, getAllMyTrips)을 받아 알림의 여행 번호가 없으면 표시. 목록을 못 받으면 표시하지 않는다.
- **R5 모두 읽음 시각**: 받은 알림 중 가장 늦은 `createdAt`을 through로 보낸다.

## Project Structure

```text
src/features/notification/
├── types.ts                 # NotificationView, 대상, 요약
├── api.ts                   # 목록·읽음·지우기·모두 읽음
├── notification-rules.ts    # 종류 표, 문장, 시각, 묶기, 대상 주소, 팝업 고르기, 투표 마감 문구
├── notification-rules.test.ts
├── testing.ts               # 테스트·미리보기 예시
├── hooks/
│   ├── notification-keys.ts
│   ├── use-notifications.ts # 목록(무한), 모두 읽음, 지우기
│   └── use-open-notification.ts  # 읽음 + 확인 + 이동, 두 번 눌러도 한 번
├── components/
│   ├── notification-row.tsx
│   ├── notification-states.tsx   # 없음·실패·볼 수 없음
│   └── notification-popup.tsx    # 모아 보기·투표 시작 모양
└── screens/
    ├── notifications-screen.tsx(+test)
    ├── notification-gone-screen.tsx(+test)
    └── popup-host.tsx(+test)
src/app/(main)/notifications/index.tsx, gone.tsx
src/app/(main)/_layout.tsx          # 팝업 자리
src/features/home/screens/home-screen.tsx  # onBell
src/api/dev-mock-notification.ts, dev-mock.ts 연결
src/app/dev/notifications.tsx
```
