---
title: "어디로그 AI 서버 작업 목록"
status: todo
created: 2026-10-27
updated: 2026-10-28
spec: "./spec.md (v0.3)"
plan: "./plan.md"
---

# 어디로그 AI 서버 작업 목록

[spec.md](./spec.md) v0.3을 구현하는 순서다. 각 작업은 **완료 조건의 테스트가 통과해야 끝난다.** 테스트 ID(T-xx)는 spec의 검증 사례다.
기술 검증은 연습 구현으로 마쳤다([verification.md](./verification.md)). 이 목록은 그 결과를 바탕으로 코드를 새로 작성하기 위한 것이다.

| # | 작업 | 완료 조건 | 상태 |
| --- | --- | --- | --- |
| 1 | 프로젝트 뼈대: pyproject(uv), 설정, `{data}`·`{error}` 공통 계약, camelCase 모델, 내부 토큰, `/health` | 공통 계약 테스트(오류 형식·traceId·401) | 할 일 |
| 2 | 백엔드 DTO 입력 모델: Place(+category), Region, SavedPlace, ItineraryItem, RouteLeg, Weather | 모델 단위 테스트 | 할 일 |
| 3 | 외부 연동: GMS(`gpt-5.6-luna`, temperature 미전송), 카카오 로컬, 카카오 길찾기(자동차·도보·대중교통, 근거리 도보 대체), 링크 메타(SSRF 방지), 이미지(EXIF 제거·HEIC) | respx 기반 단위 테스트 | 할 일 |
| 4 | `POST /place-extractions` (PLACE_EXTRACTION) | T-01-1 ~ T-01-10 | 할 일 |
| 5 | `POST /preference-inferences` | T-02-1 ~ T-02-5 | 할 일 |
| 6 | `POST /trip-recommendations` (TRIP_RECOMMENDATION) | T-03-1 ~ T-03-9 | 할 일 |
| 7 | `POST /itinerary-proposals` (ITINERARY_PROPOSAL: INITIAL·PLACE_REMOVED·WEATHER) | T-04-1 ~ T-04-10 | 할 일 |
| 8 | `POST /weather-alternatives` (WEATHER_ALTERNATIVES) | T-06-1 ~ T-06-7 | 할 일 |
| 9 | `POST /checklist-suggestions` (CHECKLIST_SUGGESTIONS) | T-07-1 ~ T-07-6 | 할 일 |
| 10 | `POST /photo-classifications` (PHOTO_CLASSIFICATION, SigLIP2) | T-08-1 ~ T-08-6 | 할 일 |
| 11 | `POST /visit-detections` (VISIT_DETECTION) | T-08-7 ~ T-08-10 | 할 일 |
| 12 | `POST /discovery-recommendations`, `POST /follow-suggestions` | spec §9 사례 | 할 일 |
| 13 | 평가 스크립트: 사진 정확도·모델 비교 | 평가 세트로 98% 안팎 재현 | 할 일 |
| 14 | 실제 키로 전 기능 확인, GPU 서버(3번)·EC2 c6g 실행 | verification.md에 기록 | 할 일 |

## 백엔드와 맞출 것 (spec §11)

| # | 내용 | 상태 |
| --- | --- | --- |
| B-1 | `places`에 공급자 분류(`category`) 저장·전달 | 요청 전 |
| B-2 | 추천 후보(`candidatePlaces`)·날씨 대안 후보(`alternativePool`)를 백엔드가 채워 전달 | 요청 전 |
| B-3 | 추천 결과의 멤버별 취향 일치 칩(S21), 친구 추천 태그 칩(S44) 필드 검토 | 요청 전 |
| B-4 | AI 호출 타임아웃 30초 이상, `X-Internal-Token`·`X-Request-Id` 전달 | 요청 전 |
