// 계약: specs/20261109-112734-checklist/contracts/checklist-api.md (백엔드 ChecklistItemResponse 기준)

/** 직접 쓴 항목(MANUAL)인지 AI 준비물 제안에서 채택한 항목(AI)인지 */
export type ChecklistSource = 'MANUAL' | 'AI';

export type ChecklistItem = {
  id: string;
  /** 앞뒤 공백 제거 후 1~255자 */
  label: string;
  checked: boolean;
  /** 챙긴 멤버 ID. 사용자 ID가 아니다. 해제하면 null */
  checkedByMemberId: string | null;
  /** 챙긴 시각 UTC. 해제하면 null */
  checkedAt: string | null;
  source: ChecklistSource;
  /** 채택한 제안 작업 ID. 직접 쓴 항목이면 null */
  sourceJobId: string | null;
  /** AI가 제안한 이유. 직접 쓴 항목이면 null */
  reason: string | null;
  /** 동행이 이름을 고쳤는지 */
  modifiedByUser: boolean;
  /** PATCH의 expectedVersion으로 보낸다 */
  version: number;
};

/** PATCH 본문. 생략한 필드는 서버가 그대로 둔다 */
export type UpdateChecklistBody = {
  expectedVersion: number;
  label?: string;
  checked?: boolean;
};

/** CHECKLIST_SUGGESTIONS 결과 한 줄. 배열 안 순번이 채택할 때 보내는 suggestionIndex다 */
export type ChecklistSuggestion = {
  label: string;
  reason: string;
  sourceJobId: string;
};

export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export type JobRef = { jobId: string; status: JobStatus; statusUrl: string };

/** GET /jobs/{jobId}. result는 kind마다 다르다 */
export type Job<R = unknown> = {
  id: string;
  kind: string;
  status: JobStatus;
  progress: number;
  result: R | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  finishedAt: string | null;
};

export type ChecklistSuggestionResult = { items: ChecklistSuggestion[] };
