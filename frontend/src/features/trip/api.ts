import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse } from '@/api/types';

import type { CreateTripBody, Region, RegionDetail, Trip } from './types';

const PAGE_SIZE = 20;
/** 여행 탭은 묶기 전에 모두 받아야 하므로 서버 최대치로 받는다. 보통 요청 1번이면 끝난다 */
const MY_TRIPS_LIMIT = 100;

/** 내가 참여 중인 여행. 서버는 만든 순서(최신부터)로 준다 */
export async function getMyTrips(cursor?: string | null): Promise<PageResponse<Trip>> {
  const { data } = await apiClient.get<PageResponse<Trip>>('/me/trips', {
    params: { limit: MY_TRIPS_LIMIT, ...(cursor ? { cursor } : {}) },
  });
  return data;
}

export async function getTrip(tripId: string): Promise<Trip> {
  const { data } = await apiClient.get<DataResponse<Trip>>(`/trips/${tripId}`);
  return data.data;
}

/** 같은 키로 다시 보내면 서버가 처음 결과를 돌려준다. 키는 src/api/idempotency.ts로 만든다 */
export async function createTrip(body: CreateTripBody, idempotencyKey: string): Promise<Trip> {
  const { data } = await apiClient.post<DataResponse<Trip>>('/trips', body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return data.data;
}

/** 이름 부분 일치. query는 1자 이상 */
export async function searchRegions(
  query: string,
  cursor?: string | null,
): Promise<PageResponse<Region>> {
  const { data } = await apiClient.get<PageResponse<Region>>('/regions', {
    params: { query, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
  });
  return data;
}

export async function getRegion(regionId: string): Promise<Region> {
  const { data } = await apiClient.get<DataResponse<RegionDetail>>(`/regions/${regionId}`);
  return data.data.region;
}
