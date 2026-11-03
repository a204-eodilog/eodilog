---
title: "어디로그 AI 서버 작업 목록"
status: todo
created: 2026-10-27
updated: 2026-11-02
spec: "./spec.md (v0.4)"
plan: "./plan.md"
---

# 어디로그 AI 서버 작업 목록

[spec.md](./spec.md) v0.4를 구현하는 순서다. 각 작업은 **완료 조건의 테스트가 통과해야 끝난다.** 테스트 ID(T-xx)는 spec의 검증 사례다.
기술 검증은 연습 구현으로 마쳤다([verification.md](./verification.md)). 이 목록은 그 결과를 바탕으로 코드를 새로 작성하기 위한 것이다.
순서는 백엔드 분담안(`EodiLog/docs/plan/backend-next-work-split-2026-11-02.md`)의 진행 순서 `jobs → 장소·지역 → 투표 → 코스`에 맞췄다.

| # | 작업 | 완료 조건 | 상태 |
| --- | --- | --- | --- |
| 0 | 백엔드 연동 계약 합의(EODI-76): DTO, 응답 처리, 시간 예산(B-4·B-5). 스텁·연동 구현보다 먼저 | 합의 결과를 이 문서와 spec에 기록 | 할 일 |
| 1 | 프로젝트 뼈대: pyproject(uv), 설정, `{data}`·`{error}` 공통 계약, camelCase 모델, 내부 토큰, `X-Trace-Id`, `/health` | 공통 계약 테스트(오류 형식·traceId·401) | 완료 |
| 2 | 입력 모델과 전 엔드포인트 계약 스텁(명세대로 고정 예시 응답) | 스텁 응답이 spec 모양과 일치 | 할 일 |
| 3 | 외부 연동: GMS(`gpt-5.6-luna`, temperature 미전송), 카카오 로컬, 카카오 길찾기(자동차·도보·대중교통, 근거리 도보 대체). 요청 45초 예산 적용 | respx 기반 단위 테스트, 예산 초과 시 503 | 완료 |
| 4 | 입력 처리: 링크 메타(SSRF 방지), 이미지(EXIF 제거·HEIC) | 단위 테스트 | 완료 |
| 5 | `POST /place-extractions` (PLACE_EXTRACTION) | T-01-1 ~ T-01-10 | 완료 |
| 6 | 장소 추출 평가 세트 30~50장, LLM 후보 비교 | 장소명 정확도 85% 이상(제안), 없는 장소를 지어낸 건 0건. 정확도·지연·실패 사례를 verification.md에 기록 | 할 일 |
| 7 | `POST /preference-inferences` | T-02-1 ~ T-02-5 | 완료 |
| 8 | `POST /trip-recommendations` (TRIP_RECOMMENDATION) | T-03-1 ~ T-03-9 | 할 일 |
| 9 | `POST /itinerary-proposals` (ITINERARY_PROPOSAL: INITIAL·PLACE_REMOVED·WEATHER) | T-04-1 ~ T-04-10 | 할 일 |
| 10 | `POST /checklist-suggestions` (CHECKLIST_SUGGESTIONS) | T-07-1 ~ T-07-6 | 할 일 |
| 11 | `POST /weather-alternatives` (WEATHER_ALTERNATIVES) | T-06-1 ~ T-06-7 | 할 일 |
| 12 | `POST /photo-classifications` (PHOTO_CLASSIFICATION, SigLIP2) | T-08-1 ~ T-08-6 | 할 일 |
| 13 | 사진 평가 스크립트, 실제 여행 사진으로 정확도 측정·임계값 재조정 | 주제 분류 정확도 90% 이상(제안). 측정값·실패 사례를 verification.md에 기록 | 할 일 |
| 14 | 배포: Docker, EC2 c6g(ARM에서 모델 실행 확인 포함), 백엔드 연결 | 백엔드 → AI 실제 호출 성공. 사진 50장(긴 변 4000px 안팎 JPEG), 동시 요청 2건, 모델을 미리 올린 상태에서 요청당 45초 이내. 모델 로딩 시간은 따로 기록 | 할 일 |
| 15 | 운영 지표: 기능별 지연·토큰·실패율 로그 | 지표 기록 | 할 일 |
| 16 | `POST /visit-detections` (VISIT_DETECTION). S45 판정 기준 합의 후 | T-08-7 ~ T-08-10 | 할 일 |
| 17 | `POST /discovery-recommendations`, `POST /follow-suggestions` | spec §9 사례 | 할 일 |

## 백엔드와 맞출 것 (spec §11)

| # | 내용 | 시점 | 상태 |
| --- | --- | --- | --- |
| B-1 | `places`에 공급자 분류(`category`) 저장·전달 | 장소·지역 API 착수 전 | 요청 전 |
| B-2 | 추천 후보(`candidatePlaces`)·날씨 대안 후보(`alternativePool`)를 백엔드가 채워 전달 | 작업 8 전 | 요청 전 |
| B-3 | 추천 결과의 멤버별 취향 일치 칩(S21), 친구 추천 태그 칩(S44) 필드 검토 | 작업 8 전 | 요청 전 |
| B-4 | AI 호출 타임아웃 50초, `X-Internal-Token`·`X-Trace-Id`(`jobId`) 전달 | AI 연동 구현 때 | 요청 전 |
| B-5 | 사용자에게 사유를 보여 줄 입력 오류는 작업 등록 전에 검사(spec §1.0) | AI 연동 구현 때 | 요청 전 |
| B-6 | `regions` 코드 체계(Q-8)·시드 시점·좌표 제공 범위 공유 | 장소·지역 API 착수 전 | 요청 전 |
| B-7 | S21 "모은 장소" 수를 `basis`에 추가할지 결정 | 작업 8 전 | 요청 전 |
| B-8 | 이동 시간 공급자를 카카오로 통일할지 결정 | 코스 작업 전 | 요청 전 |
