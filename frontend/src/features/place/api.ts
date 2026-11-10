import { apiClient } from '@/api/client';
import type { DataResponse } from '@/api/types';

import { nearParam } from './place-rules';
import type { Place } from './types';

/** 이보다 오래 걸리면 끊고 "검색이 오래 걸려 멈췄어요"를 보여 준다 */
export const SEARCH_TIMEOUT_MS = 8_000;
const SEARCH_LIMIT = 20;

/**
 * 장소 이름 검색. 백엔드가 모은 공공 장소 목록(소상공인 상가·관광공사, !134)에서 찾아 우리 ID로 준다.
 * 첫 페이지만 쓴다(한 화면에 20곳).
 * 서버 정렬: near를 주면 이름이 똑같은 곳 → near에서 가까운 순, 안 주면 똑같은 곳 → 앞부분 일치 → 포함 → 짧은 이름 순
 */
export async function searchPlaces(
  query: string,
  options?: {
    regionId?: string;
    near?: { latitude: number; longitude: number } | null;
    signal?: AbortSignal;
  },
): Promise<Place[]> {
  const { data } = await apiClient.get<DataResponse<Place[]>>('/places', {
    params: {
      query,
      limit: SEARCH_LIMIT,
      ...(options?.regionId ? { regionId: options.regionId } : {}),
      ...(options?.near ? { near: nearParam(options.near) } : {}),
    },
    timeout: SEARCH_TIMEOUT_MS,
    signal: options?.signal,
  });
  return data.data;
}

/** 지도에서 직접 고른 위치를 장소로 만든다(수동 보정 장소, source MANUAL) */
export async function createManualPlace(body: {
  name: string;
  latitude: number;
  longitude: number;
  regionId?: string;
}): Promise<Place> {
  const { data } = await apiClient.post<DataResponse<Place>>('/places', body);
  return data.data;
}
