# Implementation Plan: 추천 결과

**Branch**: `feature/EODI-239-recommendations` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

## Summary

S21 추천 결과를 만든다. 추천 작업을 POST로 만들고 GET으로 1.5초마다 확인해 생성 중·성공·겹침 없음·자료 부족·실패를 보인다. 맛집·스팟 [담기]는 그룹 즐겨찾기 담기(useFavoriteMutations)를 그대로 쓰고, 여행지 [투표 후보로]는 투표 브랜치와 합칠 때 N8로 연결한다(Q-9-2). 백엔드가 없어 테스트 모드 가짜 서버를 만든다(Q-9-1).

## Technical Context

**Language/Version**: TypeScript 5, React 19, React Native 0.88, Expo SDK 58
**Primary Dependencies**: expo-router(useFocusEffect), TanStack Query v5, 기존 group-favorites 훅, preferences api, src/components/ui
**Storage**: 없음
**Testing**: jest-expo, RNTL
**Target Platform**: Android·iOS, 웹 미리보기
**Constraints**: 작업 확인 1.5초 간격, 2분 넘으면 실패. 화면을 나가면 멈춘다
**Scale/Scope**: 한 화면, 결과 항목 수십 개

## Constitution Check

constitution이 비어 있어 frontend/CONVENTION.md 기준. 순수 규칙 분리와 테스트(recommend-rules), 화면 밖 코드는 src/features/recommend, 라우트는 src/app.

## Project Structure

```text
src/features/recommend/
  types.ts, api.ts                 # RecommendationResult, POST·GET
  recommend-rules.ts(+test)        # 항목 나누기, 근거 칸 문구, 생성 중 단계, 상태 판정
  hooks/use-recommendation.ts(+test)  # 작업 만들기와 확인, 2분 제한, 나가면 멈춤
  components/recommend-loading.tsx, basis-card.tsx, recommend-card.tsx, recommend-states.tsx
  screens/recommend-screen.tsx(+test) # RecommendView와 RecommendScreen
  testing.ts
src/app/(main)/trips/[tripId]/recommend.tsx
src/app/dev/recommend.tsx
src/api/dev-mock-recommend.ts (+ dev-mock.ts 한 줄)
src/features/trip/components/trip-menu-grid.tsx '추천' open
src/features/group-favorites/screens/group-favorites-screen.tsx [추천 받기] 연결
```
