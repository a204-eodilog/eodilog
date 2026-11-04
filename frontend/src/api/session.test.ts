import { beforeEach, expect, it, jest } from '@jest/globals';
import { AxiosError } from 'axios';

import { useSessionStore } from '@/stores/session-store';

import { publicClient, refreshAccessToken } from './session';
import type { Session } from './types';

// jest.mock은 import보다 먼저 실행된다. 밖의 변수는 mock으로 시작해야 쓸 수 있다

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null },
}));

const mockStore = new Map<string, string>();
jest.mock('@/lib/secure-storage', () => ({
  secureStorage: {
    get: async (key: string) => mockStore.get(key) ?? null,
    set: async (key: string, value: string) => void mockStore.set(key, value),
    remove: async (key: string) => void mockStore.delete(key),
  },
}));

function session(accessToken: string, refreshToken: string): Session {
  return {
    accessToken,
    refreshToken,
    expiresIn: 3600,
    isNewUser: false,
    user: {
      id: 'u1',
      nickname: '지우',
      profileImageUrl: null,
      accountVisibility: 'PUBLIC',
      followingStatus: 'NONE',
      followedByStatus: 'NONE',
      ageBand: null,
      ageUseConsent: false,
      profileCompleted: true,
      profileUrl: '',
    },
  };
}

beforeEach(async () => {
  jest.restoreAllMocks();
  mockStore.clear();
  await useSessionStore.getState().setSession(session('old-access', 'old-refresh'));
});

it('동시에 여러 번 불러도 갱신 요청은 한 번만 보낸다', async () => {
  const post = jest
    .spyOn(publicClient, 'post')
    .mockResolvedValue({ data: { data: session('new-access', 'new-refresh') } });

  const tokens = await Promise.all([
    refreshAccessToken(),
    refreshAccessToken(),
    refreshAccessToken(),
  ]);

  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith('/auth/sessions/refresh', { refreshToken: 'old-refresh' });
  expect(tokens).toEqual(['new-access', 'new-access', 'new-access']);
  expect(useSessionStore.getState().refreshToken).toBe('new-refresh');
});

it('서버가 401로 거부하면 다시 보내지 않고 토큰을 지운 뒤 만료로 표시한다', async () => {
  const rejected = new AxiosError('Unauthorized', '401', undefined, undefined, {
    status: 401,
  } as AxiosError['response']);
  const post = jest.spyOn(publicClient, 'post').mockRejectedValue(rejected);

  await expect(refreshAccessToken()).resolves.toBeNull();

  expect(post).toHaveBeenCalledTimes(1);
  const state = useSessionStore.getState();
  expect(state.status).toBe('signedOut');
  expect(state.expired).toBe(true);
  expect(mockStore.size).toBe(0);
});

it('인터넷이 끊겨 응답이 없으면 토큰을 남겨 두고 만료로 표시하지 않는다', async () => {
  const offline = new AxiosError('Network Error', 'ERR_NETWORK');
  jest.spyOn(publicClient, 'post').mockRejectedValue(offline);

  await expect(refreshAccessToken()).resolves.toBeNull();

  const state = useSessionStore.getState();
  expect(state.status).toBe('signedIn');
  expect(state.refreshToken).toBe('old-refresh');
  expect(state.expired).toBe(false);
  expect(mockStore.size).toBe(1);
});

it('서버 오류(5xx)여도 토큰은 남겨 둔다', async () => {
  const down = new AxiosError('Bad Gateway', '502', undefined, undefined, {
    status: 502,
  } as AxiosError['response']);
  jest.spyOn(publicClient, 'post').mockRejectedValue(down);

  await expect(refreshAccessToken()).resolves.toBeNull();
  expect(useSessionStore.getState().status).toBe('signedIn');
});
