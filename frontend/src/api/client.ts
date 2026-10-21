import { create, type AxiosError } from 'axios';

import { env } from '@/config/env';
import { useSessionStore } from '@/stores/session-store';

const API_TIMEOUT_MS = 10_000;

export const apiClient = create({
  baseURL: env.apiBaseUrl,
  timeout: API_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const { accessToken } = useSessionStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useSessionStore.getState().clearSession();
    }
    return Promise.reject(error);
  },
);
