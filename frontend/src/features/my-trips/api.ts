import { apiClient } from '@/api/client';
import type { DataResponse, MyProfile, PageResponse } from '@/api/types';

import type { MyTrip } from './types';

/** 서버 최대 페이지 크기. 묶음마다 개수를 보여 줘서 끝까지 읽는다 */
const PAGE_LIMIT = 100;

export async function getMe(): Promise<MyProfile> {
  const { data } = await apiClient.get<DataResponse<MyProfile>>('/me');
  return data.data;
}

/** 내가 참여 중인 여행 전부. 최근 만든 순, 나간·삭제된 여행은 빠진다 */
export async function getAllMyTrips(): Promise<MyTrip[]> {
  const all: MyTrip[] = [];
  let cursor: string | null = null;
  do {
    const { data }: { data: PageResponse<MyTrip> } = await apiClient.get('/me/trips', {
      params: { limit: PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
    });
    all.push(...data.data);
    cursor = data.page.hasNext ? data.page.nextCursor : null;
  } while (cursor);
  return all;
}
