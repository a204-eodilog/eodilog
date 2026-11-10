import { apiClient } from '@/api/client';
import { emptyIfMissing } from '@/api/missing';
import type { DataResponse, PageResponse } from '@/api/types';
import type { Follow, FriendsBoard } from '@/features/friends/types';

/** 명세의 목록 최대 크기. 다음 커서가 있으면 끝까지 읽는다. */
const PAGE_LIMIT = 100;

async function getFollows(path: string, signal?: AbortSignal, received = false): Promise<Follow[]> {
  const follows: Follow[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const { data } = await apiClient.get<PageResponse<Follow>>(path, {
      signal,
      params: {
        limit: PAGE_LIMIT,
        ...(cursor ? { cursor } : {}),
        ...(received ? { direction: 'RECEIVED' } : {}),
      },
    });
    follows.push(...data.data);
    if (!data.page.hasNext) break;
    const next = data.page.nextCursor;
    // 잘못된 커서 응답을 빈 목록으로 숨기거나 무한히 다시 요청하지 않는다.
    if (!next || cursors.has(next))
      throw new Error('팔로우 목록의 다음 페이지를 불러오지 못했어요');
    cursors.add(next);
    cursor = next;
  } while (cursor);
  return follows;
}

// 팔로우 API가 서버에 아직 없으면 빈 목록(친구 없음)으로 보여 준다
export const getFollowing = (signal?: AbortSignal) =>
  emptyIfMissing(getFollows('/me/following', signal), []);
export const getFollowers = (signal?: AbortSignal) =>
  emptyIfMissing(getFollows('/me/followers', signal), []);
export const getFollowRequests = (signal?: AbortSignal) =>
  emptyIfMissing(getFollows('/me/follow-requests', signal, true), []);

export async function getFriendsBoard(signal?: AbortSignal): Promise<FriendsBoard> {
  const [following, followers, requests] = await Promise.all([
    getFollowing(signal),
    getFollowers(signal),
    getFollowRequests(signal),
  ]);
  return { following, followers, requests };
}

export async function acceptFollowRequest(requestId: string): Promise<Follow> {
  const { data } = await apiClient.post<DataResponse<Follow>>(
    '/me/follow-requests/' + encodeURIComponent(requestId) + '/accept',
  );
  return data.data;
}

export async function rejectFollowRequest(requestId: string): Promise<void> {
  await apiClient.delete('/me/follow-requests/' + encodeURIComponent(requestId));
}

export async function unfollow(userId: string): Promise<void> {
  await apiClient.delete('/users/' + encodeURIComponent(userId) + '/follow');
}

export async function removeFollower(userId: string): Promise<void> {
  await apiClient.delete('/me/followers/' + encodeURIComponent(userId));
}
