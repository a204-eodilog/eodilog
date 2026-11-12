import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { deleteAccount, deleteCurrentSession } from './api';
import { signOut, withdraw } from './logout';

const mockClearSession = jest.fn(async () => undefined);
const mockClearCache = jest.fn();

jest.mock('./api', () => ({ deleteAccount: jest.fn(), deleteCurrentSession: jest.fn() }));
jest.mock('@/api/session', () => ({ waitForRefresh: jest.fn(async () => undefined) }));
jest.mock('@/api/query-client', () => ({ queryClient: { clear: () => mockClearCache() } }));
jest.mock('@/stores/session-store', () => ({
  useSessionStore: { getState: () => ({ clearSession: mockClearSession }) },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('탈퇴', () => {
  it('서버가 탈퇴를 받으면 기기의 자료와 토큰을 지운다', async () => {
    jest.mocked(deleteAccount).mockResolvedValue(undefined);

    await withdraw();

    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(mockClearCache).toHaveBeenCalledTimes(1);
    expect(mockClearSession).toHaveBeenCalledTimes(1);
  });

  it('서버가 받지 않으면 로그인 상태를 그대로 두고 실패를 알린다', async () => {
    jest.mocked(deleteAccount).mockRejectedValue(new Error('network'));

    await expect(withdraw()).rejects.toThrow('network');

    expect(mockClearCache).not.toHaveBeenCalled();
    expect(mockClearSession).not.toHaveBeenCalled();
  });
});

describe('로그아웃', () => {
  it('서버 세션 폐기가 실패해도 기기에서는 로그아웃한다', async () => {
    jest.mocked(deleteCurrentSession).mockRejectedValue(new Error('offline'));

    await signOut();

    expect(mockClearSession).toHaveBeenCalledTimes(1);
  });
});
