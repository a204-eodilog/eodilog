import { apiClient } from '@/api/client';
import { publicClient } from '@/api/session';
import type { DataResponse, MyProfile, Session } from '@/api/types';

import type { OAuthAuthorization, OAuthExchange } from './types';

/** 카카오 로그인 시작. 서버가 카카오 로그인 주소와 state를 준다 */
export async function requestKakaoAuthorization(body: {
  redirectUri: string;
  codeChallenge: string;
}): Promise<OAuthAuthorization> {
  const { data } = await publicClient.post<DataResponse<OAuthAuthorization>>(
    '/auth/oauth/KAKAO/authorization-requests',
    body,
  );
  return data.data;
}

/** 카카오가 돌려준 code를 우리 서비스 토큰으로 바꾼다. 한 번만 쓸 수 있다 */
export async function exchangeKakaoCode(body: OAuthExchange): Promise<Session> {
  const { data } = await publicClient.post<DataResponse<Session>>(
    '/auth/oauth/KAKAO/sessions',
    body,
  );
  return data.data;
}

export async function getMe(): Promise<MyProfile> {
  const { data } = await apiClient.get<DataResponse<MyProfile>>('/me');
  return data.data;
}

/** 현재 기기의 서버 세션만 끊는다. 다른 기기 로그인은 남는다 */
export async function deleteCurrentSession(): Promise<void> {
  await apiClient.delete('/auth/session', { timeout: 5_000 });
}
