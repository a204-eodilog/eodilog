import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse } from '@/api/types';

import type { RegionDetail, TrendRegion } from './types';

/** GET /trends/regions?from&to. 첫 쪽 20개. 내가 볼 수 있는 게시 여행만 센다 */
export async function getTrends(from: string, to: string): Promise<TrendRegion[]> {
  const { data } = await apiClient.get<PageResponse<TrendRegion>>('/trends/regions', {
    params: { from, to, limit: 20 },
  });
  return data.data;
}

/**
 * GET /regions/{regionId}. 소개는 아직 null로 온다. 대표 장소는 이 지역 게시 여행에 많이 나온 순으로 최대 5곳,
 * 게시 여행이 없으면 빈 목록
 */
export async function getRegionDetail(regionId: string): Promise<RegionDetail> {
  const { data } = await apiClient.get<DataResponse<RegionDetail>>(
    `/regions/${encodeURIComponent(regionId)}`,
  );
  return data.data;
}
