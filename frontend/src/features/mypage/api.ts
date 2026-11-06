import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse } from '@/api/types';

import type { MyFeed, MyTrip } from './types';

/** GET /me/trips 첫 쪽(최대 100개). 마이페이지 요약에는 이 정도면 된다 */
export async function getMyTrips(): Promise<MyTrip[]> {
  const { data } = await apiClient.get<PageResponse<MyTrip>>('/me/trips', {
    params: { size: 100 },
  });
  return data.data;
}

/** GET /me/feeds 첫 쪽. 게시한 공동 피드 */
export async function getMyFeeds(): Promise<MyFeed[]> {
  const { data } = await apiClient.get<PageResponse<MyFeed>>('/me/feeds', {
    params: { size: 100 },
  });
  return data.data;
}

/** GET /regions/{id} → 지역 코드. 게시 전 여행은 지역 ID만 있어 지도 자리를 찾으려고 부른다 */
export async function getRegionCode(regionId: string): Promise<string | null> {
  const { data } = await apiClient.get<DataResponse<{ region: { code: string } }>>(
    `/regions/${encodeURIComponent(regionId)}`,
  );
  return data.data.region?.code ?? null;
}

/** GET /me/following 첫 쪽. 다음 쪽이 있으면 수를 모른다(null) */
export async function getFollowingCount(): Promise<number | null> {
  const { data } = await apiClient.get<PageResponse<unknown>>('/me/following', {
    params: { size: 100 },
  });
  return data.page.hasNext ? null : data.data.length;
}
