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

/**
 * 닉네임으로 가입을 마친다. 서버 규칙: 앞뒤 공백을 뺀 1~50자. 다른 필드는 아직 받지 않는다.
 * 가입 대기 토큰으로도 부를 수 있고, 성공하면 같은 토큰으로 바로 서비스를 쓸 수 있다.
 */
export async function updateNickname(nickname: string): Promise<MyProfile> {
  const { data } = await apiClient.patch<DataResponse<MyProfile>>('/me', { nickname });
  return data.data;
}

/** 현재 기기의 서버 세션만 끊는다. 다른 기기 로그인은 남는다 */
export async function deleteCurrentSession(): Promise<void> {
  await apiClient.delete('/auth/session', { timeout: 5_000 });
}
