import { apiClient } from '@/api/client';
import type { DataResponse, Follow, PageResponse, Trip, UserCard } from '@/api/types';

/** docs/api-spec.md FeedVisibility. 본인 경로의 특정 친구별 숨김 */
export type FeedVisibility = {
  feedId: string;
  hiddenViewerUserIds: string[];
  version: number;
  updatedAt: string;
};

/** GET /me/feeds 한 줄(OwnFeed)에서 S39·S40이 쓰는 값 */
export type OwnFeedLite = {
  id: string;
  tripId: string;
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  regions: { id: string; code: string; name: string }[];
  coverPhotoId?: string | null;
  photos?: { id: string; imageUrl: string }[];
  visibility: FeedVisibility;
};

/** S39 한 줄. 동행은 숨길 수 없다(항상 보임) */
export type ViewerRow = {
  user: UserCard;
  companion: boolean;
  hidden: boolean;
};

/** GET /me/feeds → 내가 게시한 공동 피드와 내 숨김 설정 */
export async function getOwnFeeds(): Promise<OwnFeedLite[]> {
  const { data } = await apiClient.get<PageResponse<OwnFeedLite>>('/me/feeds', {
    params: { size: 100 },
  });
  return data.data;
}

/** GET /me/followers → 나를 팔로우하는 사람(내 피드를 볼 수 있는 사람) */
export async function getMyFollowers(): Promise<UserCard[]> {
  const { data } = await apiClient.get<PageResponse<Follow>>('/me/followers', {
    params: { size: 100 },
  });
  return data.data.map((f) => f.follower);
}

/** GET /trips/{tripId} → 이 여행 동행(활성 멤버) */
export async function getTripCompanions(tripId: string): Promise<UserCard[]> {
  const { data } = await apiClient.get<DataResponse<Trip>>(`/trips/${encodeURIComponent(tripId)}`);
  return data.data.members.filter((m) => m.status === 'ACTIVE').map((m) => m.user);
}

/** PUT /feeds/{feedId}/visibility/me. 숨길 친구 전체 교체, 버전이 다르면 409 */
export async function saveVisibility(
  feedId: string,
  hiddenViewerUserIds: string[],
  expectedVersion: number,
): Promise<FeedVisibility> {
  const { data } = await apiClient.put<DataResponse<FeedVisibility>>(
    `/feeds/${encodeURIComponent(feedId)}/visibility/me`,
    { hiddenViewerUserIds, expectedVersion },
  );
  return data.data;
}

/** DELETE /feeds/{feedId}?expectedVersion= 공동 피드 삭제(모든 동행 경로에서 빠짐, 원본 여행은 남음) */
export async function deleteFeed(feedId: string, expectedVersion: number): Promise<void> {
  await apiClient.delete(`/feeds/${encodeURIComponent(feedId)}`, { params: { expectedVersion } });
}

/**
 * S39 목록. 나를 팔로우하는 사람 + 이 여행 동행(나 빼고). 동행은 숨길 수 없고 맨 위.
 * 숨긴 사람(hidden)은 위 "숨긴 친구"로, 나머지는 "보여 주는 친구"로 나눠 보인다
 */
export function viewerRows(input: {
  meId: string;
  followers: readonly UserCard[];
  companions: readonly UserCard[];
  hidden: ReadonlySet<string>;
}): ViewerRow[] {
  const companionIds = new Set(input.companions.map((u) => u.id));
  const people = new Map<string, UserCard>();
  for (const u of [...input.companions, ...input.followers]) {
    if (u.id !== input.meId && !people.has(u.id)) people.set(u.id, u);
  }
  return [...people.values()].map((user) => {
    const companion = companionIds.has(user.id);
    return { user, companion, hidden: !companion && input.hidden.has(user.id) };
  });
}

/** 저장할 숨김 목록이 처음과 달라졌는지 */
export function visibilityChanged(before: readonly string[], after: ReadonlySet<string>): boolean {
  return before.length !== after.size || before.some((id) => !after.has(id));
}
