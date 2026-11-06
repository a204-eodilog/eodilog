import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse } from '@/api/types';

import type { RegionDetail, TrendRegion } from './types';

/** GET /trends/regions?from&to. 첫 쪽 20개 */
export async function getTrends(from: string, to: string): Promise<TrendRegion[]> {
  const { data } = await apiClient.get<PageResponse<TrendRegion>>('/trends/regions', {
    params: { from, to, limit: 20 },
  });
  return data.data;
}

/** GET /regions/{regionId}. 소개·대표 장소는 아직 비어 올 수 있다(introduction:null, representativePlaces:[]) */
export async function getRegionDetail(regionId: string): Promise<RegionDetail> {
  const { data } = await apiClient.get<DataResponse<RegionDetail>>(
    `/regions/${encodeURIComponent(regionId)}`,
  );
  return data.data;
}
