# Implementation Plan: AI 변경안

**Branch**: `feature/EODI-243-ai-proposals` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

## Summary

S29를 만든다. 변경안 작업(PLACE_REMOVED는 화면이 만들고, WEATHER는 S26이 만든 작업)을 기다려 지금 코스와 제안 코스를 바뀐 날 기준으로 비교한다. [적용]은 baseVersion으로 적용하고 S24로 가서 알림의 [되돌리기]로 직후 한 번 되돌린다. 백엔드가 없어 코스 가짜 서버에 변경안 종류별 결과와 적용·되돌리기를 더한다(Q-11-1).

## Technical Context

**Language/Version**: TypeScript 5, React 19, React Native 0.88, Expo SDK 58
**Primary Dependencies**: course 기능(toDraft, changedDays, CourseMap, waitForJob, getAutoCourse, MODE_LABEL), TanStack Query, toast 액션
**Testing**: jest-expo, RNTL

## Project Structure

```text
src/features/proposal/
  api.ts                      # 장소 빼기 변경안, 적용, 되돌리기
  proposal-rules.ts(+test)    # 제안을 초안으로, 바뀐 날, 요약 문구, 숫자 칸, 줄 표시
  hooks/use-proposal.ts(+test)  # 작업 만들기·기다리기, 적용(두 번 막기), 409
  hooks/use-undo.ts           # 되돌리기와 409 안내
  components/proposal-compare.tsx, proposal-fail.tsx
  screens/proposal-screen.tsx(+test)
  testing.ts
src/app/(main)/trips/[tripId]/proposal.tsx
src/app/dev/proposal.tsx
src/api/dev-mock-course.ts      # PLACE_REMOVED·WEATHER 결과, apply, undo
src/lib/korean.ts               # 을·를
src/features/course/screens/course-screen.tsx  # [빼기] → S29, 적용 알림과 되돌리기
src/features/on-trip/screens/weather-screen.tsx  # [변경안 보기] → S29
```
