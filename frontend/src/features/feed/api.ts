import { apiClient } from '@/api/client';
import type { DataResponse } from '@/api/types';

import type { Feed } from './types';

/** GET /feeds/{feedId}. 삭제된 피드는 404 */
export async function getFeed(feedId: string): Promise<Feed> {
  const { data } = await apiClient.get<DataResponse<Feed>>(`/feeds/${encodeURIComponent(feedId)}`);
  return data.data;
}

/** PUT /feeds/{feedId}/like → { liked, count } */
export async function likeFeed(feedId: string): Promise<{ liked: boolean; count: number }> {
  const { data } = await apiClient.put<DataResponse<{ liked: boolean; count: number }>>(
    `/feeds/${encodeURIComponent(feedId)}/like`,
  );
  return data.data;
}

/** DELETE /feeds/{feedId}/like → 204 */
export async function unlikeFeed(feedId: string): Promise<void> {
  await apiClient.delete(`/feeds/${encodeURIComponent(feedId)}/like`);
}
