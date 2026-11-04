import { isAxiosError } from 'axios';

import type { ApiErrorBody } from './types';

/** 서버 오류 응답의 code. "VERSION_CONFLICT", "TRIP_NOT_FOUND" (docs/api-spec.md §1). 서버 응답이 아니면 undefined */
export function apiErrorCode(error: unknown): string | undefined {
  if (!isAxiosError<ApiErrorBody>(error)) return undefined;
  return error.response?.data?.error?.code;
}
