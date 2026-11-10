import { apiClient } from '@/api/client';
import type { DataResponse } from '@/api/types';

import type {
  ChecklistItem,
  ChecklistSuggestionResult,
  Job,
  JobRef,
  UpdateChecklistBody,
} from './types';

// 계약: specs/20261109-112734-checklist/contracts/checklist-api.md
// 백엔드 ChecklistController, ChecklistSuggestionController, JobController 기준

/** GET /trips/{tripId}/checklist. 여행마다 목록 하나, 추가한 순으로 전부 */
export async function getChecklist(tripId: string, signal?: AbortSignal): Promise<ChecklistItem[]> {
  const { data } = await apiClient.get<DataResponse<{ items: ChecklistItem[] }>>(
    `/trips/${tripId}/checklist`,
    { signal },
  );
  return data.data.items;
}

/** POST /trips/{tripId}/checklist. 직접 쓴 준비물. 체크하지 않은 상태로 만들어진다 */
export async function addChecklistItem(tripId: string, label: string): Promise<ChecklistItem> {
  const { data } = await apiClient.post<DataResponse<ChecklistItem>>(`/trips/${tripId}/checklist`, {
    label,
  });
  return data.data;
}

/**
 * POST /trips/{tripId}/checklist로 AI 제안 하나를 채택한다. suggestionIndex는 작업 결과 items 순번.
 * 이미 채택한 제안이면 409 SUGGESTION_ALREADY_ADOPTED, 추천 설정이 꺼졌으면 409 AI_FEATURE_DISABLED
 */
export async function adoptSuggestion(
  tripId: string,
  input: { label: string; sourceJobId: string; suggestionIndex: number },
): Promise<ChecklistItem> {
  const { data } = await apiClient.post<DataResponse<ChecklistItem>>(
    `/trips/${tripId}/checklist`,
    input,
  );
  return data.data;
}

/**
 * PATCH /trips/{tripId}/checklist/{itemId}. 체크하면 서버가 요청한 멤버와 시각을 기록한다.
 * version이 다르면 409 VERSION_CONFLICT, 없거나 지운 항목이면 404 CHECKLIST_ITEM_NOT_FOUND
 */
export async function updateChecklistItem(
  tripId: string,
  itemId: string,
  body: UpdateChecklistBody,
): Promise<ChecklistItem> {
  const { data } = await apiClient.patch<DataResponse<ChecklistItem>>(
    `/trips/${tripId}/checklist/${itemId}`,
    body,
  );
  return data.data;
}

/** DELETE /trips/{tripId}/checklist/{itemId}. 지운 이름은 이후 AI가 다시 제안하지 않는다 */
export async function deleteChecklistItem(tripId: string, itemId: string): Promise<void> {
  await apiClient.delete(`/trips/${tripId}/checklist/${itemId}`);
}

/**
 * POST /trips/{tripId}/checklist-suggestions. 목록은 바꾸지 않고 제안 작업만 만든다.
 * 같은 Idempotency-Key로 다시 보내면 처음 작업을 돌려준다
 */
export async function requestSuggestions(tripId: string, idempotencyKey: string): Promise<JobRef> {
  const { data } = await apiClient.post<DataResponse<JobRef>>(
    `/trips/${tripId}/checklist-suggestions`,
    {},
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return data.data;
}

/** GET /jobs/{jobId}. 준비물 제안 작업이면 result가 {items} */
export async function getSuggestionJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<Job<ChecklistSuggestionResult>> {
  const { data } = await apiClient.get<DataResponse<Job<ChecklistSuggestionResult>>>(
    `/jobs/${jobId}`,
    { signal },
  );
  return data.data;
}
