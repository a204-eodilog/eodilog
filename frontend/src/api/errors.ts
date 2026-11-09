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
  /** 방장만 할 수 있는 일(넘기기·내보내기·여행 삭제)을 방장이 아닌 사람이 했다 */
  FORBIDDEN: 'FORBIDDEN',
  /** 내보낼 동행이 참여 중이 아니다 */
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  /** 없는 방·삭제된 여행의 방·참여하지 않았거나 나간 방. 서버는 셋을 구분하지 않는다 */
  CHAT_ROOM_NOT_FOUND: 'CHAT_ROOM_NOT_FOUND',
  /** 같은 clientMessageId를 다른 방이나 다른 본문에 다시 썼다 */
  CLIENT_MESSAGE_ID_REUSED: 'CLIENT_MESSAGE_ID_REUSED',
  /** 요청이 너무 많다. 잠시 뒤 다시 보낸다 */
  RATE_LIMITED: 'RATE_LIMITED',
  /** 코스 구간이 같은 날 인접한 장소 쌍과 맞지 않는다(빠짐·겹침·인접하지 않음) */
  INVALID_ROUTE_LEGS: 'INVALID_ROUTE_LEGS',
  /** 직전 적용 뒤에 다른 쓰기가 있어 되돌릴 수 없다 */
  UNDO_UNAVAILABLE: 'UNDO_UNAVAILABLE',
  /** 안내뿐인 날씨 대안이라 코스에 넣을 수 없다 */
  UNSCHEDULABLE_ALTERNATIVE: 'UNSCHEDULABLE_ALTERNATIVE',
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
