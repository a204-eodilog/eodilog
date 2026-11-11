---
title: "어디로그 AI 서버 작업 목록"
status: in-progress
created: 2026-10-27
updated: 2026-11-11
spec: "./spec.md (v0.5)"
plan: "./plan.md"
---

# 어디로그 AI 서버 작업 목록

[spec.md](./spec.md) v0.5를 구현하는 순서다. 각 작업은 **완료 조건의 테스트가 통과해야 끝난다.** 테스트 ID(T-xx)는 spec의 검증 사례다.
기술 검증은 연습 구현으로 마쳤다([verification.md](./verification.md)). 이 목록은 그 결과를 바탕으로 코드를 새로 작성하기 위한 것이다.
순서는 백엔드 분담안(`EodiLog/docs/plan/backend-next-work-split-2026-11-02.md`)의 진행 순서 `jobs → 장소·지역 → 투표 → 코스`에 맞췄다.

| # | 작업 | 완료 조건 | 상태 |
| --- | --- | --- | --- |
| 0 | 백엔드 연동 계약 합의(EODI-76): DTO, 응답 처리, 시간 예산(B-4·B-5). 스텁·연동 구현보다 먼저 | 합의 결과를 이 문서와 spec에 기록 | 대부분 완료. 백엔드가 AI 엔드포인트 10개를 연결함(아래 표). B-3·B-7 남음 |
| 1 | 프로젝트 뼈대: pyproject(uv), 설정, `{data}`·`{error}` 공통 계약, camelCase 모델, 내부 토큰, `X-Trace-Id`, `/ai/v1/health` | 공통 계약 테스트(오류 형식·traceId·401) | 완료 |
| 2 | 입력 모델과 전 엔드포인트 계약 스텁(명세대로 고정 예시 응답) | 스텁 응답이 spec 모양과 일치 | 불필요(모든 엔드포인트를 실제로 구현함) |
| 3 | 외부 연동: GMS(`gpt-5.6-luna`, temperature 미전송), 네이버 지역 검색(`naver_local.py`), 카카오 길찾기(자동차·도보·대중교통, 근거리 도보 대체). 요청 45초 예산 적용 | respx 기반 단위 테스트, 예산 초과 시 503 | 완료 |
| 4 | 입력 처리: 링크 메타(SSRF 방지), 이미지(EXIF 제거·HEIC) | 단위 테스트 | 완료 |
| 5 | `POST /place-extractions` (PLACE_EXTRACTION) | T-01-1 ~ T-01-10 | 완료 |
| 6 | 장소 추출 평가 세트 30~50장, LLM 후보 비교 | 장소명 정확도 85% 이상(제안), 없는 장소를 지어낸 건 0건. 정확도·지연·실패 사례를 verification.md에 기록 | 진행 중(GMS 기준선 + 자체 모델 비교, [vision-llm-comparison.md](./vision-llm-comparison.md)) |
| 7 | `POST /preference-inferences` | T-02-1 ~ T-02-5 | 완료 |
| 8 | `POST /trip-recommendations` (TRIP_RECOMMENDATION) | T-03-1 ~ T-03-9 | 완료 |
| 9 | `POST /itinerary-proposals` (ITINERARY_PROPOSAL: INITIAL·PLACE_REMOVED·WEATHER) | T-04-1 ~ T-04-10 | 완료 |
| 10 | `POST /checklist-suggestions` (CHECKLIST_SUGGESTIONS) | T-07-1 ~ T-07-6 | 완료 |
| 11 | `POST /weather-alternatives` (WEATHER_ALTERNATIVES) | T-06-1 ~ T-06-7 | 완료 |
| 12 | `POST /photo-classifications` (PHOTO_CLASSIFICATION, SigLIP2) | T-08-1 ~ T-08-6 | 완료(!128) |
| 13 | 사진 평가 스크립트, 실제 여행 사진으로 정확도 측정·임계값 재조정 | 주제 분류 정확도 90% 이상(제안). 측정값·실패 사례를 verification.md에 기록 | 진행 중. 실제 여행 사진(AI Hub) 포함 재측정, 주제 분류기 학습(reports §12), 사진 인코더 파인튜닝 적용 완료(reports §13). 사람 검토 남음 |
| 14 | 배포: Docker, EC2 c6g(ARM에서 모델 실행 확인 포함), 백엔드 연결 | 백엔드 → AI 실제 호출 성공. 사진 50장(긴 변 4000px 안팎 JPEG), 동시 요청 2건, 모델을 미리 올린 상태에서 요청당 45초 이내. 모델 로딩 시간은 따로 기록 | Docker 완료(노트북 x86). 사진 모델 스레드 제한(AS-21). EC2 배포는 백엔드 진행 |
| 15 | 운영 지표: 기능별 지연·토큰·실패율 로그 | 지표 기록 | 완료(요청마다 `request_metrics` 한 줄) |
| 16 | `POST /visit-detections` (VISIT_DETECTION). S45 판정 기준 합의 후 | T-08-7 ~ T-08-10 | 완료. 반경 300m 확정(2026-11-10 백엔드 회신) |
| 17 | `POST /discovery-recommendations`, `POST /follow-suggestions` | spec §9 사례 | 완료. discovery는 백엔드 연결 예정, follow는 백엔드 자체 규칙으로 현재 미사용 |
| 18 | `POST /route-legs` (ROUTE_RECALCULATION, 직접 편집 뒤 구간 시간). 길찾기 호출을 AI 서버 한 곳에 둔다(백엔드 동의, 2026-11-10) | T-04-11 ~ T-04-17 | 완료. 백엔드 연결 진행 중 |

## 백엔드와 맞출 것 (spec §11)

| # | 내용 | 시점 | 상태 |
| --- | --- | --- | --- |
| B-1 | `places`에 공급자 분류(`category`) 저장·전달 | 장소·지역 API 착수 전 | 완료(2026-11-11 백엔드 코드 확인). 준비물 요청만 아직 `category: null` |
| B-2 | 추천 후보(`candidatePlaces`)·날씨 대안 후보(`alternativePool`)를 백엔드가 채워 전달 | 작업 8 전 | 완료. 날씨 대안 후보의 `openStatus`는 늘 `UNKNOWN` |
| B-3 | 추천 결과의 멤버별 취향 일치 칩(S21), 친구 추천 태그 칩(S44) 필드 검토 | 작업 8 전 | 미반영. 추천 응답에 해당 필드 없음 |
| B-4 | AI 호출 타임아웃 50초, `X-Internal-Token`·`X-Trace-Id`(`jobId`) 전달 | AI 연동 구현 때 | 완료(연결 5초, 읽기 50초). 동기 호출인 discovery만 `jobId` 대신 임의 UUID |
| B-5 | 사용자에게 사유를 보여 줄 입력 오류는 작업 등록 전에 검사(spec §1.0) | AI 연동 구현 때 | 대부분 완료 |
| B-6 | `regions` 좌표 제공 범위 공유(코드 체계·시드는 완료) | 작업 8 전 | 일부. 좌표 열은 있고 AI로 보내지만 시드에 값이 없어 `null` |
| B-7 | S21 "모은 장소" 수를 `basis`에 추가할지 결정 | 작업 8 전 | 미반영. `basis`는 `sharedPlaceCount`·`usedMemberCount`뿐 |
| B-8 | 이동 시간 공급자를 카카오로 통일할지 결정 | 코스 작업 전 | 정리됨. 백엔드는 카카오를 직접 부르지 않고 AI `route-legs`를 부른다 |

2026-11-11 기준 백엔드가 부르는 AI 엔드포인트는 10개다: checklist-suggestions, place-extractions, discovery-recommendations, itinerary-proposals, route-legs, photo-classifications, trip-recommendations, preference-inferences, visit-detections, weather-alternatives. follow-suggestions는 부르지 않는다.
