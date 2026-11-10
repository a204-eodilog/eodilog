# Research: 준비물 체크리스트

## R1. 체크 연타와 version

- **Decision**: 항목마다 `check-queue`를 둔다. 보내는 중인 요청이 있으면 다음 원하는 상태만 기억하고, 응답이 오면 받은 version으로 다음 요청을 보낸다. 원하는 상태가 서버 상태와 같아지면 보내지 않는다. 화면은 원하는 상태를 바로 그린다(낙관적 반영).
- **Rationale**: PATCH는 expectedVersion이 필요해 요청을 겹쳐 보내면 두 번째가 반드시 409가 난다. 하나씩 보내고 마지막 상태만 이어 보내면 5번 연타가 최대 2번 요청으로 줄고 충돌이 생기지 않는다.
- **Alternatives**: 연타를 막는 디바운스(반응이 늦어 보임), 요청마다 취소(서버엔 이미 반영될 수 있어 version이 어긋남).

## R2. 충돌·삭제 처리

- **Decision**: 409 VERSION_CONFLICT면 목록을 다시 받고 "다른 동행이 먼저 바꿨어요. 최신 목록을 불러왔어요" 안내. 404 CHECKLIST_ITEM_NOT_FOUND면 캐시에서 그 항목을 빼고 "이미 지워진 준비물이에요" 안내. 네트워크 오류면 마지막 서버 상태로 되돌리고 "저장하지 못했어요. 연결을 확인해 주세요".
- **Rationale**: 서버가 덮어쓰기를 막으므로 화면은 최신을 다시 보여 주는 것이 가장 단순하고 안전하다.

## R3. 제안 작업 기다리기

- **Decision**: POST checklist-suggestions에 `Idempotency-Key`(같은 시도 안에서는 같은 키, 성공·실패로 끝나면 버림)를 붙여 JobRef를 받고, GET /jobs/{jobId}를 1.5초 간격으로 묻는다. SUCCEEDED면 결과 items를 쓰고, FAILED·CANCELLED·2분 초과·조회 오류는 실패 카드. 화면을 나가면(언마운트) 기다림을 멈춘다.
- **Rationale**: 실시간 이벤트는 범위 밖이다. 같은 키 재전송으로 작업이 하나만 생긴다.
- **Alternatives**: react-query refetchInterval(작업 시작·끝·취소를 화면 상태와 묶기 어려움).

## R4. 제안 채택

- **Decision**: `pickSuggestions(items, result)`로 지금 목록 이름(앞뒤 공백 제거·소문자)과 결과 안 중복을 빼고 순번을 유지해 고른다. 고른 것을 순서대로 POST checklist `{label, sourceJobId, suggestionIndex}`로 채택한다. 409 SUGGESTION_ALREADY_ADOPTED·400은 건너뛴다. 409 AI_FEATURE_DISABLED면 멈추고 꺼짐 카드. 끝나면 목록을 다시 받는다.
- **Rationale**: 서버가 지운 이름은 제안하지 않고, 기존 항목은 건드리지 않으므로 직접 고친 항목·지운 항목이 그대로다.

## R5. 챙긴 사람 이름

- **Decision**: `checkedByMemberId`를 여행 상세 `members[].id`로 찾아 `user.nickname`을 쓴다. 못 찾으면 "동행". 조사는 `withIGa`(받침 있으면 이, 없으면 가, 한글 아니면 이(가)).

## R6. 추천 설정 꺼짐

- **Decision**: 409 AI_FEATURE_DISABLED면 실패 카드 문구를 "준비물 추천이 꺼져 있어요 · 설정에서 켜면 제안을 받을 수 있어요"로 바꾸고 버튼을 [설정 열기](`/settings`)로 둔다.

## R7. 진입과 미리보기

- **Decision**: `trip-menu-grid`의 today에 `open: (tripId) => router.push(\`/trips/${tripId}/checklist\`)`를 더한다. `/dev/checklist?state=`로 default·empty·suggest-fail·disabled·suggesting·edit-sheet·load-error 상태를 직접 그린다. 테스트 모드 가짜 서버는 `dev-mock-checklist.ts`.
