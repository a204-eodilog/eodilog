---
title: "어디로그 AI 서버 구현 계획"
status: draft
version: "0.1"
created: 2026-10-27
spec: "./spec.md (v0.3)"
---

# 어디로그 AI 서버 구현 계획

[spec.md](./spec.md)를 어떻게 구현할지 정한다. 무엇을 만드는지는 spec, 어떻게 나누는지는 이 문서, 작업 순서와 완료 조건은 [tasks.md](./tasks.md)를 본다.

## 1. 기술 선택

| 항목 | 선택 | 이유 |
| --- | --- | --- |
| 언어·런타임 | Python 3.11 | GPU 서버·이미지 모델 생태계 |
| 웹 프레임워크 | FastAPI + Uvicorn | Jira EODI-74, 비동기 외부 호출, OpenAPI 문서 자동 생성 |
| 패키지 관리 | uv | 잠금 파일로 GPU 서버와 로컬 환경을 맞춘다 |
| 검증 | Pydantic v2 | 요청·응답 스키마 = spec의 JSON |
| HTTP | httpx (비동기) | 외부 API, 테스트에서 respx로 가짜 응답 |
| LLM | openai SDK + GMS `base_url` | GMS가 OpenAI 호환 |
| HTML 파싱 | BeautifulSoup | 링크 메타데이터 |
| 이미지 | Pillow | 재인코딩, EXIF 읽기 |
| 사진 모델 | open_clip + SigLIP2 `ViT-B-32-SigLIP2-256` (선택 설치 `vision`, HEIC는 pillow-heif) | 로컬 GPU·CPU, 외부 전송 없음. CLIP과 비교 후 선정(verification.md) |
| 테스트 | pytest + pytest-asyncio + respx | spec 검증 사례 = 테스트 |

## 2. 폴더 구조

```
ai/
├─ pyproject.toml, uv.lock, .env.example
├─ docs/  spec.md(v0.3), plan.md, tasks.md, verification.md
├─ scripts/ eval_photos.py, compare_models.py   # 사진 정확도·모델 비교
├─ app/
│  ├─ main.py               # 앱 생성, 라우터, 백엔드 형식 오류 처리({error:{code,message,fields,traceId}})
│  ├─ core/
│  │  ├─ config.py          # 환경변수
│  │  ├─ schemas.py         # CamelModel, Data{data}, ApiError
│  │  ├─ models.py          # 백엔드 DTO 모양: Place, Region, SavedPlace, ItineraryItem, RouteLeg, Weather
│  │  ├─ llm.py             # GMS 클라이언트, 이름 별칭
│  │  ├─ container.py       # 외부 의존성 묶음
│  │  ├─ security.py        # X-Internal-Token
│  │  ├─ taste_match.py, place_rules.py, text.py   # 취향 일치, 실내·식사·머무는 시간, 조사
│  ├─ clients/              # kakao_local(장소), travel(카카오 길찾기 3종), page_meta(SSRF 방지), images(EXIF·HEIC)
│  └─ features/             # 백엔드 job kind 하나 = service.py + router.py
│     ├─ places/            # PLACE_EXTRACTION
│     ├─ tastes/            # 취향 추론
│     ├─ group_rec/         # TRIP_RECOMMENDATION
│     ├─ course/            # ITINERARY_PROPOSAL (INITIAL·PLACE_REMOVED·WEATHER)
│     ├─ weather/           # WEATHER_ALTERNATIVES
│     ├─ packing/           # CHECKLIST_SUGGESTIONS
│     ├─ photos/            # PHOTO_CLASSIFICATION·VISIT_DETECTION, embedder(SigLIP2)
│     ├─ similar/           # discovery-recommendations
│     └─ friends/           # follow-suggestions
└─ tests/                   # spec 검증 사례 T-xx, 가짜 LLM·장소·경로·임베더
```

v0.3에서 바뀐 점: 작업 관리는 백엔드가 하므로 모든 API가 동기 응답이다(사진 작업 저장소 제거). 날씨는 백엔드가 조회해 넘기므로 Open-Meteo 클라이언트를 뺐다.

## 3. 설계 원칙

1. **로직은 service, 입출력은 router.** service는 FastAPI를 모른다. 테스트는 주로 API를 통해 하되, 계산이 복잡한 부분(코스 배분, 묶음)은 service를 직접 테스트한다.
2. **외부 의존성은 `Container` 하나로 모은다.** 앱 시작 때 실제 구현을 만들고, 테스트는 가짜 구현을 넣은 `Container`로 앱을 만든다. 전역 변수·모듈 수준 싱글턴을 쓰지 않는다.
3. **사실 데이터와 모델 문장을 분리한다.** 좌표·날씨·이동 시간은 clients에서만 온다. LLM 결과는 정해진 JSON 키만 읽고, 목록 밖 장소 ID가 오면 버린다.
4. **LLM은 항상 실패할 수 있다고 본다.** `LLMUnavailable`을 잡아 규칙 결과로 계속하거나 spec이 정한 상태를 반환한다. 이름은 `M1`, `M2` 별칭으로 바꿔 보낸다.
5. **상태 판정은 spec 표를 그대로 코드로 옮긴다.** 판정 함수를 따로 두고 표의 각 행을 테스트한다.

## 4. 외부 의존성 대체 (테스트·키 없음)

| 의존성 | 키 없을 때 | 테스트 |
| --- | --- | --- |
| GMS | `LLMUnavailable` → 기능별 대체 동작 | `FakeLLM` (응답을 미리 정해 둠) |
| 카카오 장소 검색 | `PlaceSearchUnavailable` | `FakePlaceSearch` |
| 이동 시간 | `UNAVAILABLE` 구간 | `FakeTravel` (좌표 쌍 → 분) |
| SigLIP2 | `vision` 미설치·로드 실패면 503 `PROVIDER_UNAVAILABLE` | `FakeEmbedder` (평균 색으로 정해진 벡터) |
| 링크 메타데이터 | — | respx로 HTTP 응답 고정, DNS 검사는 주입한 해석기로 대체 |

## 5. 실행 환경 (구현 후)

- 로컬(Windows, RTX 4070): `uv sync --group dev` → `uv run pytest`, `uv run uvicorn app.main:app --reload`
- 사진 모델까지: `uv sync --extra vision`
- GPU 서버(H200 NVL, 3번): `CUDA_VISIBLE_DEVICES=3 uv run uvicorn app.main:app --host 0.0.0.0 --port 8000`

## 6. 위험

| 위험 | 대응 |
| --- | --- |
| SNS가 봇 요청을 막아 메타데이터가 비어 있음 | 캡처 경로가 주 경로. 링크를 못 읽어도 캡처로 계속, 모두 못 읽으면 `resultStatus: FAILED` |
| LLM이 캡처 글자를 실행마다 다르게 읽음(예: 흰여울 → 한여울) | 지어내지 않고 `place: null`로 직접 검색 유도. 장소 추출 평가 세트로 오인식률 측정 |
| 이미지 모델이 실제 사진에서 주제를 잘 못 나눔 | 주제 문장을 여러 개 두고 평균. 평가 세트(AI 생성 60장)로 98.3% → 실제 사진으로 다시 측정 |
| 공용 GPU 3번을 다른 팀이 점유 | 모델이 작아서(약 1GB) 메모리 영향이 적음. CPU로도 동작 |
