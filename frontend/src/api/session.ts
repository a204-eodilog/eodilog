import { create, isAxiosError } from 'axios';

import { env } from '@/config/env';
import { useSessionStore } from '@/stores/session-store';

import type { DataResponse, Session } from './types';

/** 명세의 경로는 모두 이 아래다. 요청할 때는 /api/v1 뒤만 쓴다 */
export const API_BASE_PATH = '/api/v1';
const AUTH_TIMEOUT_MS = 10_000;

/** 토큰을 붙이지 않는 요청. 로그인·갱신처럼 Bearer가 필요 없는 호출에 쓴다 */
export const publicClient = create({
  baseURL: `${env.apiBaseUrl}${API_BASE_PATH}`,
  timeout: AUTH_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

let refreshing: Promise<string | null> | null = null;

/**
 * access 토큰 갱신. 여러 요청이 동시에 401을 받아도 갱신 요청은 한 번만 보내고 결과를 나눠 쓴다.
 * 한 번 쓴 refresh 토큰을 다시 보내면 서버가 그 로그인 전체를 끊으므로, 실패하면 다시 보내지 않고 다시 로그인하게 한다.
 */
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= runRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** 로그아웃처럼 갱신과 겹치면 안 되는 일은 진행 중인 갱신이 끝난 뒤 한다 */
export async function waitForRefresh(): Promise<void> {
  if (refreshing) await refreshing;
}

async function runRefresh(): Promise<string | null> {
  const { refreshToken, setSession, clearSession } = useSessionStore.getState();
  if (!refreshToken) return null;
  try {
    const { data } = await publicClient.post<DataResponse<Session>>('/auth/sessions/refresh', {
      refreshToken,
    });
    await setSession(data.data);
    return data.data.accessToken;
  } catch (error) {
    // 서버가 토큰을 거부했을 때(401)만 지운다. 인터넷이 끊겼거나 서버가 잠깐 안 될 때는
    // 토큰을 남겨 두고 이번 요청만 실패시킨다. 다음 요청에서 다시 갱신을 시도한다
    if (isAxiosError(error) && error.response?.status === 401) {
      await clearSession({ expired: true });
    }
    return null;
  }
}
