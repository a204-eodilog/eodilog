import { apiClient } from '@/api/client';
import type { DataResponse } from '@/api/types';
import { VOICE_UPLOAD_MIME, VOICE_UPLOAD_NAME } from '@/lib/voice-recording';

import type { ExpenseWrite, JobRef, VoiceJob } from './types';

/**
 * POST /trips/{tripId}/expense-voice-drafts. 녹음 파일 한 개를 보내 분석 작업을 만든다(202 + JobRef).
 * 접수 응답을 놓쳐 다시 보낼 때는 같은 Idempotency-Key를 쓴다. 실패한 작업을 다시 분석할 때는 새 키
 */
export async function submitVoiceDraft(
  tripId: string,
  uri: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<JobRef> {
  const form = new FormData();
  // RN의 FormData는 { uri, name, type }을 파일로 올린다
  form.append('audio', {
    uri,
    name: VOICE_UPLOAD_NAME,
    type: VOICE_UPLOAD_MIME,
  } as unknown as Blob);
  const { data } = await apiClient.post<DataResponse<JobRef>>(
    `/trips/${tripId}/expense-voice-drafts`,
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data', 'Idempotency-Key': idempotencyKey },
      signal,
    },
  );
  return data.data;
}

/** GET /jobs/{jobId}. 성공이면 result가 인식문과 초안 목록. 만료·남의 작업이면 404 JOB_NOT_FOUND */
export async function getVoiceJob(jobId: string, signal?: AbortSignal): Promise<VoiceJob> {
  const { data } = await apiClient.get<DataResponse<VoiceJob>>(`/jobs/${jobId}`, { signal });
  return data.data;
}

/**
 * POST /trips/{tripId}/expenses/batch. 고른 1~10건을 한 번에 저장한다. 한 건이라도 틀리면 모두 저장하지 않는다.
 * 같은 목록을 다시 보낼 때는 같은 Idempotency-Key(두 번 만들지 않는다)
 */
export async function saveExpenseBatch(
  tripId: string,
  items: ExpenseWrite[],
  idempotencyKey: string,
): Promise<{ expenses: { id: string }[] }> {
  const { data } = await apiClient.post<DataResponse<{ expenses: { id: string }[] }>>(
    `/trips/${tripId}/expenses/batch`,
    { items },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return data.data;
}
