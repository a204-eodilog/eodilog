import { beforeEach, expect, it, jest } from '@jest/globals';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

import { useSessionStore } from '@/stores/session-store';

import { apiClient } from './client';
import { publicClient } from './session';
import type { Session } from './types';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
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

const unauthorized = (config: InternalAxiosRequestConfig) =>
  new AxiosError('401', 'ERR_BAD_REQUEST', config, null, {
    status: 401,
    statusText: 'Unauthorized',
    data: {},
    headers: {},
    config,
  });

beforeEach(async () => {
  jest.restoreAllMocks();
  mockStore.clear();
  await useSessionStore.getState().setSession(session('old-access', 'old-refresh'));
});

it('갱신이 이미 끝난 뒤 옛 토큰 요청의 401이 오면 다시 갱신하지 않고 지금 토큰으로 다시 보낸다', async () => {
  const refresh = jest.spyOn(publicClient, 'post');
  const sent: string[] = [];
  const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
    const auth = String(AxiosHeaders.from(config.headers).get('Authorization'));
    sent.push(auth);
    if (auth === 'Bearer old-access') {
      // 이 요청이 나가 있는 사이 다른 요청이 갱신을 마쳤다
      await useSessionStore.getState().setSession(session('new-access', 'new-refresh'));
      throw unauthorized(config);
    }
    return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
  });

  const res = await apiClient.get('/me', { adapter });

  expect(res.status).toBe(200);
  expect(sent).toEqual(['Bearer old-access', 'Bearer new-access']);
  expect(refresh).not.toHaveBeenCalled();
});

it('지금 토큰으로 보낸 요청이 401이면 갱신한 뒤 다시 보낸다', async () => {
  const refresh = jest
    .spyOn(publicClient, 'post')
    .mockResolvedValue({ data: { data: session('new-access', 'new-refresh') } });
  const sent: string[] = [];
  const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
    const auth = String(AxiosHeaders.from(config.headers).get('Authorization'));
    sent.push(auth);
    if (auth === 'Bearer old-access') throw unauthorized(config);
    return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
  });

  const res = await apiClient.get('/me', { adapter });

  expect(res.status).toBe(200);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(sent).toEqual(['Bearer old-access', 'Bearer new-access']);
});
