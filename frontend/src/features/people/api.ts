import { apiClient } from '@/api/client';
import type { DataResponse, Follow, PageResponse, UserCard } from '@/api/types';

import type { FriendSuggestion, PublicProfile, UserFeedCard } from './types';

/** GET /users?query= 닉네임 검색(결정 Q-2). 프로필 링크·ID 검색은 없다 */
export async function searchUsers(query: string): Promise<UserCard[]> {
  const { data } = await apiClient.get<PageResponse<UserCard>>('/users', {
    params: { query, limit: 30 },
  });
  return data.data;
}

/**
 * 추천 친구 `GET /me/follow-suggestions`. 서버에 아직 없으면(404) 빈 목록으로 본다
 */
export async function getSuggestions(): Promise<FriendSuggestion[]> {
  try {
    const { data } = await apiClient.get<PageResponse<FriendSuggestion>>('/me/follow-suggestions');
    return data.data;
  } catch (e) {
    if ((e as { response?: { status?: number } }).response?.status === 404) return [];
    throw e;
  }
}

/** 추천에서 숨기기(다시 추천 안 함, 만료 없음) `PUT /me/follow-suggestion-dismissals/{userId}` */
export async function hideSuggestion(userId: string): Promise<void> {
  await apiClient.put(`/me/follow-suggestion-dismissals/${encodeURIComponent(userId)}`);
}

/** POST /users/{userId}/follow. 공개 계정이면 ACCEPTED, 비공개면 REQUESTED */
export async function followUser(userId: string): Promise<Follow> {
  const { data } = await apiClient.post<DataResponse<Follow>>(
    `/users/${encodeURIComponent(userId)}/follow`,
  );
  return data.data;
}

/** DELETE /users/{userId}/follow. 팔로우 끊기·요청 취소 */
export async function unfollowUser(userId: string): Promise<void> {
  await apiClient.delete(`/users/${encodeURIComponent(userId)}/follow`);
}

/** GET /users/{userId} */
export async function getUser(userId: string): Promise<PublicProfile> {
  const { data } = await apiClient.get<DataResponse<PublicProfile>>(
    `/users/${encodeURIComponent(userId)}`,
  );
  return data.data;
}

/** GET /users/{userId}/feeds. 비공개 계정을 팔로우하지 않았으면 서버가 막는다(403) */
export async function getUserFeeds(userId: string): Promise<UserFeedCard[]> {
  const { data } = await apiClient.get<PageResponse<UserFeedCard>>(
    `/users/${encodeURIComponent(userId)}/feeds`,
    { params: { limit: 100 } },
  );
  return data.data;
}
