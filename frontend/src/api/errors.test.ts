import { describe, expect, it } from '@jest/globals';
import { AxiosError, AxiosHeaders } from 'axios';

import { API_ERROR, hasErrorCode, toApiError } from './errors';

function httpError(status: number, data: unknown, headers: Record<string, string> = {}) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, {
    status,
    statusText: '',
    data,
    headers,
    config,
  });
}

describe('toApiError', () => {
  it('서버 오류 본문의 코드·안내·칸 오류·traceId를 꺼낸다', () => {
    const e = httpError(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: '입력값을 확인해 주세요',
        fields: [{ field: 'title', message: '여행 이름을 입력해 주세요' }],
        traceId: 'trace-1',
      },
    });

    expect(toApiError(e)).toEqual({
      kind: 'http',
      status: 400,
      code: API_ERROR.VALIDATION_ERROR,
      message: '입력값을 확인해 주세요',
      fields: { title: '여행 이름을 입력해 주세요' },
      traceId: 'trace-1',
    });
  });

  it('본문에 traceId가 없으면 응답 헤더 값을 쓴다', () => {
    const e = httpError(500, 'Bad Gateway', { 'x-trace-id': 'trace-h' });
    const result = toApiError(e);

    expect(result.code).toBeNull();
    expect(result.traceId).toBe('trace-h');
  });

  it('응답이 없으면 네트워크 오류다', () => {
    const e = new AxiosError('Network Error', 'ERR_NETWORK');

    expect(toApiError(e)).toMatchObject({ kind: 'network', status: null, code: null });
  });

  it('시간 초과는 timeout이다', () => {
    const e = new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED');

    expect(toApiError(e).kind).toBe('timeout');
  });

  it('axios 오류가 아니어도 모양을 맞춘다', () => {
    expect(toApiError(new Error('boom'))).toMatchObject({ kind: 'network', message: 'boom' });
  });

  it('hasErrorCode로 코드를 확인한다', () => {
    const e = httpError(404, { error: { code: 'TRIP_NOT_FOUND', message: '', fields: [] } });

    expect(hasErrorCode(e, API_ERROR.TRIP_NOT_FOUND)).toBe(true);
    expect(hasErrorCode(e, API_ERROR.PROFILE_INCOMPLETE)).toBe(false);
  });
});
