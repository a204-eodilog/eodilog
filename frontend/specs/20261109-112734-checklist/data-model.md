# Data Model: 준비물 체크리스트

## ChecklistItem (서버 §10)

| 필드 | 타입 | 설명 |
|---|---|---|
| id | string | 준비물 ID |
| label | string | 이름, 앞뒤 공백 제거 후 1~255자 |
| checked | boolean | 챙김 여부 |
| checkedByMemberId | string \| null | 챙긴 멤버 ID(사용자 ID 아님). 해제면 null |
| checkedAt | string \| null | 챙긴 시각 UTC |
| source | 'MANUAL' \| 'AI' | 직접 작성 또는 AI 제안 채택 |
| sourceJobId | string \| null | 채택한 제안 작업 ID |
| reason | string \| null | AI 제안 이유 |
| modifiedByUser | boolean | 동행이 이름을 고쳤는지 |
| version | number | PATCH expectedVersion |

화면 표시 규칙:
- 출처 표시: MANUAL → '직접 추가', AI && modifiedByUser → '직접 고침', AI && !modifiedByUser → 없음
- 둘째 줄: [reason(전구)] + [· {이름}{이/가} 챙겨요]. 둘 다 없으면 줄 숨김
- 진행: total = items.length, done = checked 수, ratio = total ? done/total : 0

## JobRef / Job

- JobRef: `{ jobId, status, statusUrl }`
- Job: `{ id, kind, status: QUEUED|RUNNING|SUCCEEDED|FAILED|CANCELLED, progress, result, error: {code,message}|null, createdAt, finishedAt }`
- CHECKLIST_SUGGESTIONS result: `{ items: [{ label, reason, sourceJobId }] }` — 순번이 suggestionIndex

## 화면 상태

- `loading` → `error`(목록 없음) | `empty`(items 0) | `list`
- 제안: `idle` → `requesting` → `waiting` → `adopting` → `idle`, 실패 시 `failed`(general | disabled)
- 체크 큐(항목별): `idle` ↔ `sending`(+ pending 원하는 상태)
