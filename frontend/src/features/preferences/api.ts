import { isAxiosError } from 'axios';

import { apiClient } from '@/api/client';
import type { DataResponse } from '@/api/types';

import type { Preferences, PreferencesWrite, TripPreferenceScope } from './types';

/** 내 취향 조회 키. S03과 S45가 같은 값을 본다 */
export const PREFERENCES_QUERY_KEY = ['me', 'preferences'] as const;

/**
 * 내 취향. 아직 한 번도 저장하지 않았으면(404) null.
 * 2026-11-04 기준 백엔드에 이 API가 아직 없어서 404가 나도 빈 취향으로 시작한다.
 */
export async function getPreferences(): Promise<Preferences | null> {
  try {
    const { data } = await apiClient.get<DataResponse<Preferences>>('/me/preferences');
    return data.data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) return null;
    throw error;
  }
}

/** 직접 고른 취향 전체를 바꾼다. 추론 허용·공유 범위는 함께 보낸다 */
export async function savePreferences(body: PreferencesWrite): Promise<Preferences> {
  const { data } = await apiClient.put<DataResponse<Preferences>>('/me/preferences', body);
  return data.data;
}

/** 서버가 찾은 취향 하나를 뺀다. 다시 추론하지 않는 표시도 함께 남는다 */
export async function removeInferredPreference(key: string): Promise<void> {
  await apiClient.delete(`/me/preferences/inferred/${encodeURIComponent(key)}`);
}

/** 이 여행의 동행 추천에 내 취향을 쓸지. 나만 보기는 NONE */
export async function setTripPreferenceConsent(
  tripId: string,
  scope: TripPreferenceScope,
): Promise<void> {
  await apiClient.put(`/trips/${tripId}/members/me/preference-consent`, { scope });
}
