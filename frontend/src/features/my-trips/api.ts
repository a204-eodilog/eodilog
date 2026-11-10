import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse } from '@/api/types';

import type { MyTrip, RecordTrip, TripFeed } from './types';

/** 서버 최대 페이지 크기. 묶음마다 개수를 보여 줘서 끝까지 읽는다 */
const PAGE_LIMIT = 100;

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

export async function getRecordTrip(tripId: string): Promise<RecordTrip> {
  const { data } = await apiClient.get<DataResponse<RecordTrip>>(`/trips/${tripId}`);
  return data.data;
}

/** GET /trips/{tripId}/feed. 게시 전·삭제 후면 null(조회가 게시하지 않는다) */
export async function getTripFeed(tripId: string): Promise<TripFeed | null> {
  const { data } = await apiClient.get<DataResponse<TripFeed | null>>(
    `/trips/${encodeURIComponent(tripId)}/feed`,
  );
  return data.data;
}

/**
 * POST /trips/{tripId}/feed 공동 게시(FeedWrite). 여행당 하나라 이미 게시됐으면 서버가 기존 피드를 돌려준다.
 * 제목은 여행 이름, 본문은 비워 둔다(S38에 입력 칸이 없다)
 */
export async function publishTripFeed(tripId: string, title: string): Promise<TripFeed> {
  const { data } = await apiClient.post<DataResponse<TripFeed>>(
    `/trips/${encodeURIComponent(tripId)}/feed`,
    { title, body: '' },
  );
  return data.data;
}
