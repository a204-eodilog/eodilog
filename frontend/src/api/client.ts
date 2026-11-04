import { create, type AxiosError, type InternalAxiosRequestConfig } from 'axios';

import { env } from '@/config/env';
import { useSessionStore } from '@/stores/session-store';

import { API_BASE_PATH, refreshAccessToken } from './session';

const API_TIMEOUT_MS = 10_000;

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

// 측정용(quickstart 시나리오 4·13): 개발 모드에서만 여행 만들기·목록 요청을 콘솔에 남긴다.
// 연타해도 만들기 요청이 몇 번 나갔는지, 첫 화면까지 목록 요청이 몇 번인지 센다. 토큰은 남기지 않는다
const MEASURED = ['post /trips', 'get /me/trips'];

function measured(config: InternalAxiosRequestConfig | undefined) {
  return __DEV__ && !!config && MEASURED.includes(`${config.method} ${config.url}`);
}

function logRequest(config: InternalAxiosRequestConfig) {
  const key = config.headers['Idempotency-Key'];
  console.log(`[api] → ${config.method?.toUpperCase()} ${config.url}${key ? ` key=${key}` : ''}`);
}

function logResult(config: InternalAxiosRequestConfig, result: number | string) {
  console.log(`[api] ← ${result} ${config.method?.toUpperCase()} ${config.url}`);
}

/** 로그인한 사용자의 요청. 경로는 명세의 /api/v1 뒤만 쓴다. 예: apiClient.get('/me') */
export const apiClient = create({
  baseURL: `${env.apiBaseUrl}${API_BASE_PATH}`,
  timeout: API_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const { accessToken } = useSessionStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  if (measured(config)) logRequest(config);
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    if (measured(response.config)) logResult(response.config, response.status);
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    if (config && measured(config))
      logResult(config, error.response?.status ?? error.code ?? 'network');
    if (error.response?.status !== 401 || !config || config._retried) {
      return Promise.reject(error);
    }
    // access 토큰이 만료됐다. 갱신을 한 번만 시도하고 원래 요청을 다시 보낸다
    const token = await refreshAccessToken();
    if (!token) return Promise.reject(error);
    config._retried = true;
    config.headers.Authorization = `Bearer ${token}`;
    return apiClient(config);
  },
);
