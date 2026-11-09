# Implementation Plan: 여행 중과 날씨 대안

**Branch**: `feature/EODI-241-on-trip-weather` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

## Summary

S25 여행 중과 S26 날씨 대안을 만든다. 오늘 날짜로 여행 단계를 나누고, 오늘 코스(코스 기능의 useItinerary)와 그 첫 장소의 날씨를 보인다. 날씨 대안은 작업을 만들어 기다린 뒤(코스 waitForJob 재사용) 대안을 고르고, 고른 대안으로 WEATHER 변경안 작업을 만들어 결과 시트를 보인다. 날씨 API가 없어 테스트 모드 가짜 서버를 만든다(Q-10-1).

## Technical Context

**Language/Version**: TypeScript 5, React 19, React Native 0.88, Expo SDK 58
**Primary Dependencies**: TanStack Query v5, expo-router, course 기능(useItinerary, waitForJob, getJob, getAutoCourse, legLabel), src/components/ui
**Testing**: jest-expo, RNTL
**Constraints**: 작업 확인 1.5초, 2분 제한, 화면을 나가면 멈춤. 시각은 기기 시각 기준

## Project Structure

```text
src/features/on-trip/
  types.ts, api.ts               # Weather, 날씨 대안 결과, WEATHER 변경안 요청, 준비물 요약·추가
  on-trip-rules.ts(+test)        # 여행 단계, 날씨 문구, 비 그침, 관측·예보, 비 영향 일정, 다음 일정, 대안 줄
  hooks/use-weather.ts, use-weather-alternatives.ts(+test), use-checklist-summary.ts
  components/weather-card.tsx, trip-tools.tsx, today-course.tsx, before-start.tsx,
             alternative-list.tsx, proposal-sheet.tsx, no-alternative.tsx
  screens/on-trip-screen.tsx(+test), weather-screen.tsx(+test)
  testing.ts
src/app/(main)/trips/[tripId]/today.tsx, weather.tsx
src/app/dev/on-trip.tsx
src/api/dev-mock-weather.ts (+ dev-mock.ts 한 줄)
src/components/ui/icon.tsx         # 날씨 아이콘 몇 개 추가
src/features/trip/components/trip-menu-grid.tsx  # '여행 중' → S25
```
