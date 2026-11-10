# Contract: 준비물 API (백엔드 ChecklistController·ChecklistSuggestionController·JobController 기준)

모든 경로 앞에 `/api/v1`. 응답은 `DataResponse {data}`.

| 동작 | 요청 | 성공 | 오류 |
|---|---|---|---|
| 목록 | GET /trips/{tripId}/checklist | 200 `{items: ChecklistItem[]}` 추가한 순 | 404 TRIP_NOT_FOUND |
| 추가 | POST /trips/{tripId}/checklist `{label}` | 201 ChecklistItem | 400 VALIDATION_ERROR, 404 TRIP_NOT_FOUND |
| 제안 채택 | POST /trips/{tripId}/checklist `{label, sourceJobId, suggestionIndex}` | 201 ChecklistItem(source AI) | 400(없는 작업·순번), 409 SUGGESTION_ALREADY_ADOPTED, 409 AI_FEATURE_DISABLED |
| 수정·체크 | PATCH /trips/{tripId}/checklist/{itemId} `{expectedVersion, label?, checked?}` | 200 ChecklistItem. 바뀐 값 없으면 version 유지 | 404 CHECKLIST_ITEM_NOT_FOUND, 409 VERSION_CONFLICT |
| 삭제 | DELETE /trips/{tripId}/checklist/{itemId} | 204 | 404 CHECKLIST_ITEM_NOT_FOUND |
| 제안 요청 | POST /trips/{tripId}/checklist-suggestions 헤더 `Idempotency-Key` 본문 `{}` | 202 JobRef | 409 AI_FEATURE_DISABLED, 409 IDEMPOTENCY_KEY_REUSED·REQUEST_IN_PROGRESS |
| 작업 조회 | GET /jobs/{jobId} | 200 Job | 404 JOB_NOT_FOUND |

앱 처리:
- PATCH 409 → 목록 다시 받기 + 안내. 404 → 캐시에서 빼기 + 안내.
- 채택 409 SUGGESTION_ALREADY_ADOPTED·400 → 건너뜀. AI_FEATURE_DISABLED → 멈추고 꺼짐 카드.
- 제안 요청 REQUEST_IN_PROGRESS → 같은 키로 1초 뒤 한 번 더. 그래도 실패면 실패 카드.
