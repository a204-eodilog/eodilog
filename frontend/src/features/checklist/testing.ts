import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

import type { ChecklistItem, ChecklistSuggestion, ChecklistSuggestionResult, Job } from './types';

/** 서버가 오류 코드로 답한 것과 같은 오류. toApiError가 status와 code를 읽는다 */
export function httpError(status: number, code: string): AxiosError {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  return new AxiosError(code, 'ERR_BAD_REQUEST', config, null, {
    status,
    statusText: code,
    headers: {},
    config,
    data: { error: { code, message: code, fields: [], traceId: null } },
  });
}

/** 서버에 닿지 못한 오류 */
export function networkError(): AxiosError {
  return new AxiosError('Network Error', 'ERR_NETWORK');
}

let seq = 0;

/** 테스트와 미리보기용 준비물. 기본은 직접 쓴, 챙기지 않은 항목 */
export function checklistItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  seq += 1;
  return {
    id: `item-${seq}`,
    label: `준비물 ${seq}`,
    checked: false,
    checkedByMemberId: null,
    checkedAt: null,
    source: 'MANUAL',
    sourceJobId: null,
    reason: null,
    modifiedByUser: false,
    version: 1,
    ...overrides,
  };
}

/** 테스트와 미리보기용 제안 한 줄 */
export function suggestion(label: string, reason = '', jobId = 'job-1'): ChecklistSuggestion {
  return { label, reason, sourceJobId: jobId };
}

/** 테스트용 준비물 제안 작업 */
export function suggestionJob(
  overrides: Partial<Job<ChecklistSuggestionResult>> = {},
): Job<ChecklistSuggestionResult> {
  return {
    id: 'job-1',
    kind: 'CHECKLIST_SUGGESTIONS',
    status: 'QUEUED',
    progress: 0,
    result: null,
    error: null,
    createdAt: '2026-11-09T00:00:00Z',
    finishedAt: null,
    ...overrides,
  };
}
