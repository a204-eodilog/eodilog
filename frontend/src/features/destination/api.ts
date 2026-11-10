import { apiClient } from '@/api/client';
import { emptyIfMissing } from '@/api/missing';
import type { DataResponse, PageResponse } from '@/api/types';

import type { RegionDetail, TrendRegion } from './types';

/** GET /trends/regions?from&to. 첫 쪽 20개. 서버에 아직 없으면 순위 없음으로 본다 */
export function getTrends(from: string, to: string): Promise<TrendRegion[]> {
  return emptyIfMissing(
    apiClient
      .get<PageResponse<TrendRegion>>('/trends/regions', { params: { from, to, limit: 20 } })
      .then(({ data }) => data.data),
    [],
  );
}

/** GET /regions/{regionId}. 소개·대표 장소는 아직 비어 올 수 있다(introduction:null, representativePlaces:[]) */
export async function getRegionDetail(regionId: string): Promise<RegionDetail> {
  const { data } = await apiClient.get<DataResponse<RegionDetail>>(
    `/regions/${encodeURIComponent(regionId)}`,
  );
  return data.data;
}
