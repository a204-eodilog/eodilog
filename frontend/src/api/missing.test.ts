import { describe, expect, it } from '@jest/globals';
import { AxiosError, type AxiosResponse } from 'axios';

import { emptyIfMissing } from './missing';

function httpError(status: number, code: string) {
  const response = { status, data: { error: { code, message: '', fields: [] } } } as AxiosResponse;
  return new AxiosError('fail', undefined, undefined, undefined, response);
}

describe('emptyIfMissing', () => {
  it('성공하면 값 그대로', async () => {
    await expect(emptyIfMissing(Promise.resolve([1]), [])).resolves.toEqual([1]);
  });

  it('서버에 경로가 없으면(404 NOT_FOUND) 빈 값', async () => {
    await expect(emptyIfMissing(Promise.reject(httpError(404, 'NOT_FOUND')), [])).resolves.toEqual(
      [],
    );
  });

  it('자료가 없는 404와 다른 오류는 그대로 던진다', async () => {
    await expect(
      emptyIfMissing(Promise.reject(httpError(404, 'TRIP_NOT_FOUND')), []),
    ).rejects.toBeInstanceOf(AxiosError);
    await expect(
      emptyIfMissing(Promise.reject(httpError(500, 'INTERNAL_ERROR')), []),
    ).rejects.toBeInstanceOf(AxiosError);
  });
});
