import type { ImageSource } from 'expo-image';

import { API_BASE_PATH } from '@/api/session';
import { env } from '@/config/env';
import { useSessionStore } from '@/stores/session-store';

/**
 * 서버 사진 주소 → expo-image 소스. 공개 사진(PublicPhoto.imageUrl)은 로그인해야 받는
 * `/assets/{assetId}/download?...` 경로라 서버 주소를 붙이고 로그인 토큰을 같이 보낸다.
 * 명세 경로는 /api/v1 뒤의 경로라 앞에 붙인다(이미 붙어 있으면 그대로).
 * 이미 전체 주소(https://)거나 기기 안 주소(file:, content:, blob: 등 방금 고른 사진)면 그대로 쓴다.
 * 테스트 모드의 가짜 주소는 받지 않는다(null).
 * 프로필 사진(UserCard.profileImageUrl)도 같은 `/assets/{assetId}/download` 경로다
 */
export function assetSource(url: string | null | undefined): ImageSource | null {
  if (!url) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return { uri: url };
  if (env.devMock) return null;
  const { accessToken } = useSessionStore.getState();
  const path = url.startsWith('/') ? url : `/${url}`;
  const full = path.startsWith(`${API_BASE_PATH}/`) ? path : `${API_BASE_PATH}${path}`;
  return {
    uri: `${env.apiBaseUrl}${full}`,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  };
}
