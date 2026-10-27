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
| LLM | GMS `gpt-5.6-luna` (openai SDK + GMS `base_url`) | GMS가 OpenAI 호환. 모델은 §1.1 |
| HTML 파싱 | BeautifulSoup | 링크 메타데이터 |
| 이미지 | Pillow | 재인코딩, EXIF 읽기 |
| 사진 모델 | open_clip + SigLIP2 `ViT-B-32-SigLIP2-256` (선택 설치 `vision`, HEIC는 pillow-heif) | 로컬 GPU·CPU, 외부 전송 없음. 모델은 §1.1 |
| 테스트 | pytest + pytest-asyncio + respx | spec 검증 사례 = 테스트 |

### 1.1 모델 선정

AI 서버가 쓰는 모델은 두 개다. 둘 다 환경변수로 바꿀 수 있고, 바꿔도 API 계약(spec)은 그대로다. 측정값의 출처는 [verification.md](./verification.md)다.

| 용도 | 선택 | 어디서 실행 | 환경변수 |
| --- | --- | --- | --- |
| 글·캡처 이해, 추천·준비물 문장 | **GMS `gpt-5.6-luna`** | 외부 API(GMS) | `LLM_MODEL`, `VISION_MODEL` |
| 사진 주제 분류, 비슷한 사진 묶기 | **SigLIP2 `ViT-B-32-SigLIP2-256`** (webli 가중치) | 우리 서버(GPU 서버 3번 또는 EC2 c6g CPU) | `CLIP_MODEL`, `CLIP_PRETRAINED` |

LLM이 하지 않는 일: 좌표·주소(카카오 장소 검색), 이동 시간(카카오 길찾기), 날씨(백엔드 조회), 점수·순서·시각 계산(규칙). LLM은 문장과 이름 읽기만 한다.

#### LLM: `gpt-5.6-luna`

| 후보 | GMS 제공 | 결과 |
| --- | --- | --- |
| **`gpt-5.6-luna`** | O | **선택.** 텍스트 1.2초, 이미지 1.4초(단건). 캡처 장소 추출 전체 3.5~6.1초 |
| `gpt-4.1-mini` | O | 연습 구현 초기에 사용. 캡처 장소 추출 2.4초 |
| `gpt-4.1`, `gpt-4o`, `gpt-5.5`, `gpt-5.1`, `gpt-5`, `gpt-5-mini` | O | 호출만 확인, 품질 비교는 하지 않음 |
| `gpt-5.6`, `gpt-5.6-mini` | **X** (GMS에 없음) | — |

- **고른 이유:** 팀 결정(2026-10-27). 사용자가 적고 GMS 예산이 넉넉해 비용보다 최신 모델의 품질을 우선했다. 텍스트·이미지를 한 모델로 처리한다.
- **솔직한 한계:** LLM 후보끼리 품질을 같은 평가 세트로 비교하지 않았다. 지금 근거는 "동작 확인 + 팀 결정"이다.
- **쓸 때 주의:**
  - `temperature`를 보내면 400 오류. 기본값으로는 보내지 않는다(`LLM_TEMPERATURE` 비움).
  - 캡처 속 이름에 업종을 붙여 읽는 경향("신기산업" → "신기산업 카페")이 있어 프롬프트로 막았다.
  - 같은 캡처도 실행마다 글자를 다르게 읽을 수 있다("흰여울" → "한여울"). 이때 지어내지 않고 `place: null`로 직접 검색에 넘긴다.
- **다시 검토할 조건:** 장소 추출 평가 세트(캡처 30~50장)에서 오인식이 잦을 때, 추출 응답이 화면 목표 10초를 넘길 때, GMS 정책·예산이 바뀔 때. 이때 `gpt-4.1`·`gpt-5.5`와 같은 세트로 비교한다.

#### 사진 모델: SigLIP2 `ViT-B-32-SigLIP2-256`

평가 세트: AI 생성 사진 60장(풍경·음식·사람·기타 각 15장, 비슷한 사진 쌍 8개, 어려운 사례 4개). 같은 주제 문장, 로컬 CPU.

| 후보 | 정확도(영어 문장) | 정확도(한국어 문장) | 장당 속도(CPU) | 비슷한 사진 구분 | 결과 |
| --- | --- | --- | --- | --- | --- |
| CLIP `ViT-B-32` (laion2b) | 96.7~98.3% | 41.7% | 23~38ms | 가장 깔끔(쌍 최소 0.979 / 비쌍 최대 0.888) | 처음 사용, 교체 |
| **SigLIP2 `ViT-B-32-SigLIP2-256`** | **98.3%** | **93.3%** | 32~85ms | 기준 0.94로 8쌍 모두, 잘못 묶음 0 | **선택** |
| SigLIP2 `ViT-B-16-SigLIP2` | 98.3% | 95.0% | 77ms | 비쌍이 0.936까지 올라 기준 잡기 어려움 | 느리고 이득 없음 |
| SigLIP2 `ViT-SO400M-14-SigLIP2` | — | — | — | — | 측정 안 함(GPU 전용 크기) |

- **고른 이유:**
  1. 정확도는 CLIP과 같은 수준이다(60장에서 1장 차이라 우열 없음).
  2. **한국어 문장을 쓸 수 있다.** 나중에 "바다 사진만 보기" 같은 한국어 검색을 넣을 수 있다.
  3. B-16보다 훨씬 빠르고, 크기가 작아(메모리 약 1GB) EC2 c6g(CPU)에서도 돈다.
- **대가:** CPU에서 CLIP보다 약 2.2배 느리다(서비스 경로 기준 장당 모델 85ms). 사진 50장 기준 수 초라 백엔드 작업으로 처리하기에 충분하다.
- **CLIP과 다른 점(구현 시 주의):** 점수는 sigmoid(scale·유사도 + bias)이고 주제마다 따로 나온다. 주제는 가장 높은 점수로 고른다. 비슷한 사진 기준은 0.94(CLIP은 0.92)로 모델마다 다시 잡아야 한다. 다국어 토크나이저 때문에 `transformers`가 필요하다.
- **솔직한 한계:** 평가 세트가 AI 생성 이미지이고, 주제 문장을 같은 세트로 고른 뒤 측정했다. 98.3%는 낙관적인 값이다.
- **다시 검토할 조건:** 실제 휴대폰 사진에서 정확도가 90% 아래로 떨어질 때(→ 주제 문장 조정, B-16 재비교), EC2 c6g에서 사진 50장이 30초를 넘을 때(→ CLIP B-32로 되돌림, 환경변수만 바꾸면 됨).

#### 지금 쓰지 않는 선택지

| 선택지 | 쓰지 않는 이유 | 언제 다시 보나 |
| --- | --- | --- |
| 자체 비전 LLM(예: Qwen 계열 VL 7B)을 GPU 서버에서 서빙 | GPU 서버를 서비스에서 바로 부를 수 없다(외부 포트 차단, 주피터 프록시 확장 없음). EC2 c6g(CPU)로는 이미지 한 장에 수십 초 | 캡처 추출을 GMS 없이 해야 할 때. H200에서 vLLM으로 띄워 GMS와 정확도·속도·비용을 같은 세트로 비교(포트폴리오 실험 후보) |
| 우리 사진으로 파인튜닝한 SigLIP2 | 실제 사진 데이터가 아직 없다 | 실제 사진 정확도가 부족할 때. GPU 서버에서 학습 → 가중치를 EC2로 옮겨 서비스 |
| 임베딩 기반 추천(벡터 검색) | 지금 추천은 태그·분류 규칙으로 충분하고 DB에 벡터를 저장하지 않는다 | 추천 품질을 지표로 비교할 때. 이때 DB는 PostgreSQL + pgvector가 필요하다 |

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
