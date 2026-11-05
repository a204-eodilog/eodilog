import { expect, it, jest } from '@jest/globals';
import { AxiosError, AxiosHeaders } from 'axios';

import { expenseFailure } from './use-expense-mutations';

// 훅이 불러오는 api.ts가 expo-crypto·axios 인스턴스를 만들어서, 판단 함수만 시험하도록 막아 둔다
jest.mock('../api', () => ({}));
// 목록 훅이 쓰는 useMe(@/hooks/use-me)가 apiClient를 만들면서 환경 변수를 읽어서 함께 막아 둔다
jest.mock('@/api/client', () => ({ apiClient: {} }));

function apiError(status: number, code: string) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('fail', undefined, config, undefined, {
    status,
    statusText: '',
    headers: {},
    config,
    data: { error: { code, message: '' } },
  });
}

it('먼저 바뀐 지출(409)은 conflict, 이미 지워진 지출(404)은 gone — 둘 다 목록을 다시 읽는다', () => {
  expect(expenseFailure(apiError(409, 'VERSION_CONFLICT'))).toBe('conflict');
  expect(expenseFailure(apiError(404, 'EXPENSE_NOT_FOUND'))).toBe('gone');
});

it('그 밖의 실패는 error — 같은 입력으로 다시 보내면 된다', () => {
  expect(expenseFailure(apiError(403, 'FORBIDDEN'))).toBe('error');
  expect(expenseFailure(apiError(404, 'TRIP_NOT_FOUND'))).toBe('error');
  expect(expenseFailure(new Error('network'))).toBe('error');
});
