---
title: "AI와 백엔드 계약 대조"
status: one-sided-check
created: 2026-11-09
jira: EODI-76
checked:
  - "origin/dev 21ca2c3"
  - "origin/feature/EODI-149-ai-recommendation-apis ef31816 (!166)"
updated: 2026-11-10
---

# AI와 백엔드 계약 대조

> **합의 문서가 아니다.** AI 쪽에서 코드와 문서를 읽고 혼자 대조한 결과다. 백엔드 작업자의 확인을 받지 않았고, tasks.md 작업 0은 여전히 할 일이다.

## 2026-11-10 현황 (origin/dev 20804c0 이후 다시 확인)

아래 "공통 계약"부터의 표는 21ca2c3 기준이다. 이 절과 다르면 **이 절이 맞다.**

| 항목 | 지금 상태 | 근거 |
| --- | --- | --- |
| `places.category` | 해결. 저장하고 AI 입력에 쓴다 | `docs/erd.dbml` places.category, `J/extraction/PlaceExtractionJobHandler.java:239` |
| 추출 장소의 `regionId` | 해결. 주소로 지역을 찾아 채운다 | `J/extraction/PlaceExtractionJobHandler.java:148-150` (`RegionAddressMatcher`) |
| 날씨 조회와 날씨 대안 | 해결. 대안 후보는 반경 2km 안, 분류가 있는 장소 30곳 | `J/weather/alternative/AlternativePoolReader.java:22-23,43` |
| 코스 제안 `WEATHER` | 구현됨. `PLACE_REMOVED`는 확인하지 못함 | `J/itinerary/proposal/ItineraryProposalService.java:116-125` |
| 취향 추론 | 연결됨. 백엔드가 `preference-inferences`를 부른다 | `J/user/preference/PreferenceInferenceHandler.java` |
| 사진 분류 | 연결됨 | `J/photo/classification/ClassificationHandler.java` |
| 트렌드 추천(`trip-recommendations`), 좋아요 추천, 친구 추천, 방문 판정 | 아직 호출 코드가 없다 | 호출하는 AI 경로는 6개뿐: checklist, itinerary, photo, place-extractions, preference, weather |
| 이동 시간 재계산(`ROUTE_RECALCULATION`) | 이름만 있고 처리기가 없다 | `J/job/JobKind.java:5` |
| 이동 시간 공급자 | 백엔드에 길찾기 호출이 없다. AI가 카카오로 구한다. 11-03 문서는 네이버 통일이라 어긋남 | spec §11 #10 |

이번에 확인하지 못한 것: 코스 제안 요청의 `Place`에 `category`가 실려 가는지, 날씨 대안의 `openStatus` 값, `regions` 좌표 시드.

경로 약어: `J/` = `EodiLog/src/main/java/com/eodilog/`, `RES/` = `EodiLog/src/main/resources/`, `MR/` = !166 브랜치의 `ai/app/features/`.

## 요약

- 백엔드는 **이미 AI 서버를 호출한다.** 실행기가 있는 것은 `PLACE_EXTRACTION`과 `CHECKLIST_SUGGESTIONS` 두 개다(`docs/api-spec.md:301`).
- 호출 클라이언트, 내부 토큰, 추적 ID, 시간 예산, 재시도 분류는 AI spec §1과 맞는다.
- 나머지 8개 엔드포인트는 백엔드에 호출 코드가 없다. `JobKind`에 이름만 있거나(`J/job/JobKind.java:4-5`) API 명세에만 있다.
- 지금 가장 큰 문제는 오류가 나지 않고 결과만 나빠지는 입력 누락이다. `category`, `regionId`, 후보 장소, 날씨가 여기에 해당한다.

## 공통 계약

| 항목 | AI | 백엔드 | 판정 |
| --- | --- | --- | --- |
| 내부 토큰 | `X-Internal-Token` = `INTERNAL_API_TOKEN` (spec §1) | 같은 헤더, 값은 `AI_INTERNAL_TOKEN` (`J/global/ai/HttpAiServerClient.java:29`, `RES/application.yaml:50`) | 일치. 환경변수 이름이 달라 배포 때 같은 값을 넣어야 함 |
| 토큰이 빈 경우 | 401 | 헤더를 보내지 않음(`HttpAiServerClient.java:91`), 4xx라 재시도 없이 실패(`:102`) | 동작은 맞음. 잘못 배포하면 모든 AI 작업이 바로 실패 |
| 추적 ID | `X-Trace-Id` | `jobId`를 넣음(`HttpAiServerClient.java:30,90`) | 일치 |
| 시간 예산 | 45초 안에 끝내거나 503 | 연결 5초, 읽기 50초, job 60초(`RES/application.yaml:51-52,39`) | 일치 |
| 재시도 | 503·500·연결 실패·타임아웃은 일시 실패 3회, 4xx는 실패 | 5xx와 연결 실패만 재시도(`HttpAiServerClient.java:102,106`), 3회·30초(`RES/application.yaml:42-43`) | 일치 |
| 응답 봉투 | `{"data": ...}` | `data` 객체를 꺼냄(`HttpAiServerClient.java:117`) | 일치 |
| HTTP 버전 | uvicorn은 h2c 미지원 | HTTP/1.1 고정(`HttpAiServerClient.java:52`) | 일치 |
| 주소 | 포트 8000 | `AI_BASE_URL`, 기본 `http://localhost:8000` (`RES/application.yaml:49`) | 운영 값 미정(작업 14) |

## 엔드포인트별 대조

### 백엔드가 호출 중

| 엔드포인트 | 맞는 점 | 어긋나는 점 | 영향 |
| --- | --- | --- | --- |
| `place-extractions` | multipart `url`·`memo`·`captures`(`PlaceExtractionJobHandler.java:96,103-105`). 10장, 장당 15MB, 2048자, 500자 한도 일치(`ExtractionService.java:33-36`, `PlaceExtractionJobHandler.java:45`, `ai/app/features/place_extraction/router.py:11-12,23-25`). 후보 상한 60 = AI 20언급×3곳(`StoredExtraction.java:19`). `candidateId`와 `place.id`는 백엔드가 만듦(`PlaceExtractionJobHandler.java:128,131`) | `regionCode`를 null로 넘겨 `region_id`가 비고, `category`는 버림(`PlaceExtractionJobHandler.java:228`) | 저장된 장소가 추천의 지역 묶음과 취향 일치에서 빠짐 |
| | | `regionHint`를 보내지 않음. 작업에 `tripId`가 없음(`PlaceExtractionJobHandler.java:64`) | 지역 단서 없는 이름은 다른 지역 지점으로 연결될 수 있음. 평가에서 `신기산업`이 서울·안양으로 나온 사례 있음 |
| | | 링크가 없고 캡처를 하나도 못 읽으면 메모가 있어도 AI를 부르지 않음(`PlaceExtractionJobHandler.java:99`) | 낮음. API가 메모 단독을 받지 않아 드문 경우 |
| `checklist-suggestions` | 요청 키 일치(`ChecklistSuggestionJobHandler.java:25,51-52`, `ai/app/features/checklist_suggestion/service.py:106-112`). 백엔드 모양의 본문을 AI 모델로 검증해 통과(`existingItems`의 추가 필드는 무시됨). `sourceJobId` = `jobId` 검사(`ChecklistSuggestionResult.java:45`). 상한 50 일치(`:18`) | `weather`가 항상 `[]`(`ChecklistSuggestionJobHandler.java:48,52`) | 비, 기온 규칙이 동작하지 않음 |
| | | `place.category`가 항상 null(`ChecklistSuggestionService.java:70-74`) | "걷는 장소", "바다" 규칙이 이름으로만 판단 |

두 실행기의 실제 AI 연동 테스트는 있으나(`ExtractionRealAiTest.java:88,134`, `ChecklistSuggestionRealAiTest.java:36`) 환경변수가 있을 때만 돈다. 이번 점검에서는 실행하지 않았다.

### 백엔드 호출 코드가 없음

| 엔드포인트 | 백엔드 명세 | 대조 결과 | 시작 전에 정할 것 |
| --- | --- | --- | --- |
| `trip-recommendations` (!166) | `api-spec.md:148-149,363,420` | 응답 `items`·`basis`·`insufficientData` 일치(`MR/trip_recommendation/service.py:115-130`). `Place` 응답에 명세에 없는 `category`가 그대로 나옴 | `candidatePlaces` 출처(B-2). `regionId`가 없는 장소는 지역 추천에서 빠짐(`MR/trip_recommendation/service.py:287`) |
| `itinerary-proposals` (!166) | `api-spec.md:176-177,371-373,403,421` | 최상위 키 일치(`MR/itinerary_proposal/service.py:112-118`). 새 항목 `id: null`, 구간 `fromItemId`·`toItemId`가 null일 수 있음(`:77-81`). 백엔드 `RouteLeg`는 ID 필수(`api-spec.md:371`) | 적용 때 ID 발급과 `day`·`fromOrder`·`toOrder` 연결 방법. `ProposalWrite`의 `sourceWeatherJobId`·`selectedAlternativeId`를 AI의 `selectedAlternative` 객체로 펼치는 일(`api-spec.md:373`, `MR/itinerary_proposal/service.py:103`) |
| `weather-alternatives` | `api-spec.md:187,424` | 응답 키 일치. `Weather` 필드 일치(`api-spec.md:375`, `ai/app/features/weather_alternatives/service.py:106-118`). 백엔드에 날씨 조회 코드가 없음(`ChecklistSuggestionJobHandler.java:48`) | 날씨 공급자, `alternativePool` 출처, `openStatus` 값 |
| `photo-classifications` | `api-spec.md:218,426` | 응답 일치(`ai/app/features/photo_classification/service.py:64-73`) | 본문 크기(아래 질문 4) |
| `visit-detections` | `api-spec.md:184,406,422` | AI는 작업 16이라 미구현. 백엔드는 비공개 위치와 `capturedAtLocal`을 저장(`J/asset/ImageSanitizer.java:140-144`, `docs/erd.dbml:232`). AI spec의 `capturedAt`은 ISO UTC | 시간대 없는 EXIF 시각을 어떻게 보낼지. 판정 정책(Q-7) |
| `preference-inferences` | `api-spec.md:88-91,350` | `inferredItems` 모양 일치. 백엔드 취향 코드 없음 | 호출 시점(job kind 없음), 재추론 주기(Q-5) |
| `discovery-recommendations` (!166) | `api-spec.md:150,364` | AI는 `feedId`·`placeId`를 반환(`MR/recommendations/service.py:37-41`). 백엔드 DTO는 `FeedCard`·`Place` | 백엔드가 ID로 카드를 채움(spec에 맞는 동작). 입력 `tags`·`placeCategories`의 출처 |
| `follow-suggestions` (!166) | `api-spec.md:86` | AI는 `userId`·`reason`(`MR/recommendations/service.py:61-63`). 백엔드는 `user:UserCard` | 백엔드가 카드를 채움. 태그 칩(B-3) |

## B-1~B-8 코드 기준 상태

| # | 내용 | 코드에서 확인한 상태 | 근거 |
| --- | --- | --- | --- |
| B-1 | `places.category` | 없음 | `docs/erd.dbml:162-173`, `PlaceExtractionJobHandler.java:228`, `ChecklistSuggestionService.java:70-74` |
| B-2 | 후보 장소 전달 | 없음. `PlaceProvider` 인터페이스만 있고 구현체가 없음. 공공데이터(SBDC, KTO) 가져오기는 있음 | `J/place/provider/PlaceProvider.java:6`, `EodiLog/docs/plan/public-place-import.md:7-8` |
| B-3 | 취향 칩 필드 | 명세에 없음 | `api-spec.md:86,363` |
| B-4 | 타임아웃, 토큰, 추적 ID | **반영** | `RES/application.yaml:50-52`, `HttpAiServerClient.java:29-30` |
| B-5 | 작업 등록 전 입력 검사 | 구현된 두 기능만 반영 | `ExtractionService.java:61,66` |
| B-6 | `regions` 좌표 | 칼럼은 있으나 시드에 좌표가 없음 | `docs/erd.dbml:157-158`, `RES/db/migration/V202611021500*:4` |
| B-7 | "모은 장소" 수 | 명세에 없음 | `api-spec.md:363` |
| B-8 | 이동 시간 공급자 | 미결. 백엔드에 경로 공급자 코드가 없고 `ROUTE_RECALCULATION`은 이름만 있음 | `J/job/JobKind.java:4-5`, spec §11 #10 |

## 열린 질문

1. **날씨 `openStatus`:** AI는 `{value: OPEN|CLOSED|UNKNOWN, checkedAt}`을 받는다(`weather_alternatives/service.py:121-123`). 백엔드 명세와 코드에 영업 정보가 없다. 출처가 없으면 전부 `UNKNOWN`으로 보낼지 정해야 한다. `UNKNOWN`도 대체 후보에 들어간다.
2. **응답의 `place.category`:** 백엔드 `Place`에 없는 필드가 추천·날씨 대안 응답에 그대로 나온다(`api-spec.md:357`). 저장할 때 뺄지, DTO에 추가할지 정해야 한다.
3. **B-8 공급자:** AI 코스는 카카오 길찾기를 쓴다. `ROUTE_RECALCULATION`도 같은 공급자를 써야 구간 시간이 같다.
4. **사진 50장 본문:** AI 한도는 장당 15MB, 50장이다(`photo_classification/service.py:21`, `router.py:13`). 백엔드 파일 한도도 15MB다(`RES/application.yaml:23`). 평가 사진 기준 한 요청이 약 118MB이고 최악은 750MB다. 백엔드 multipart는 파일을 `byte[]`로 메모리에 올린다(`AiServerClient.java:28`). job 동시 실행은 2개다(`RES/application.yaml:45`). AI는 긴 변 448px로 줄여 쓰므로 표시본을 줄여 보낼 수 있다. 저장되는 표시본 크기가 줄어드는지는 이번 점검에서 확인하지 못했다.
5. **네이버 장소 ID(spec §11 #11):** 추출 결과는 AI의 해시를 그대로 저장한다. 백엔드가 네이버 검색을 따로 붙이면 같은 규칙(AS-12)을 써야 같은 장소가 된다.
6. **지역 연결:** 추출 장소의 `regionId`를 어떻게 채울지 정해야 한다. 네이버 응답에는 법정동 코드가 없다.
