import { apiClient } from '@/api/client';
import type { DataResponse } from '@/api/types';

import type { SettingsPatch, UserSettings } from './types';

/** 내 AI·알림 설정. 첫 조회 때 서버가 기본값(version 1)을 만든다 */
export async function getSettings(): Promise<UserSettings> {
  const { data } = await apiClient.get<DataResponse<UserSettings>>('/me/settings');
  return data.data;
}

/** 바꾼 필드만 보낸다. expectedVersion이 서버와 다르면 409 VERSION_CONFLICT */
export async function patchSettings(body: SettingsPatch): Promise<UserSettings> {
  const { data } = await apiClient.patch<DataResponse<UserSettings>>('/me/settings', body);
  return data.data;
}
