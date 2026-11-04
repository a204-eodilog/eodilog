import { isAxiosError } from 'axios';

import type { ApiErrorBody } from './types';

/** 화면이 분기에 쓰는 서버 오류 코드 */
export const API_ERROR = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PROFILE_INCOMPLETE: 'PROFILE_INCOMPLETE',
  TRIP_NOT_FOUND: 'TRIP_NOT_FOUND',
  REGION_NOT_FOUND: 'REGION_NOT_FOUND',
  REQUEST_IN_PROGRESS: 'REQUEST_IN_PROGRESS',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
} as const;

/**
 * 앱 안에서 쓰는 오류 모양.
 * http: 서버가 답했다 / network: 서버에 닿지 못했다 / timeout: 기다리다 끊었다
 */
export type ApiError = {
  kind: 'http' | 'network' | 'timeout';
  status: number | null;
  /** 서버 오류 코드. 서버 답이 없으면 null */
  code: string | null;
  message: string;
  /** 입력 칸 이름 → 안내 문구 */
  fields: Record<string, string>;
  /** 백엔드 로그에서 같은 요청을 찾을 때 쓴다 */
  traceId: string | null;
};

function isErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.code === 'string'
  );
}

/** axios가 던진 오류를 ApiError로 바꾼다. 화면은 code로만 분기한다 */
export function toApiError(e: unknown): ApiError {
  if (!isAxiosError(e)) {
    return {
      kind: 'network',
      status: null,
      code: null,
      message: e instanceof Error ? e.message : String(e),
      fields: {},
      traceId: null,
    };
  }
  const response = e.response;
  if (!response) {
    return {
      kind: e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT' ? 'timeout' : 'network',
      status: null,
      code: null,
      message: e.message,
      fields: {},
      traceId: null,
    };
  }
  const body = isErrorBody(response.data) ? response.data.error : null;
  const fields: Record<string, string> = {};
  for (const f of body?.fields ?? []) fields[f.field] = f.message;
  const headerTrace = response.headers?.['x-trace-id'];
  return {
    kind: 'http',
    status: response.status,
    code: body?.code ?? null,
    message: body?.message ?? e.message,
    fields,
    traceId: body?.traceId ?? (typeof headerTrace === 'string' ? headerTrace : null),
  };
}

export function hasErrorCode(e: unknown, code: string): boolean {
  return toApiError(e).code === code;
}

/** 서버 오류 응답의 code. "VERSION_CONFLICT", "TRIP_NOT_FOUND" (docs/api-spec.md §1). 서버 응답이 아니면 undefined */
export function apiErrorCode(error: unknown): string | undefined {
  if (!isAxiosError<ApiErrorBody>(error)) return undefined;
  return error.response?.data?.error?.code;
}
