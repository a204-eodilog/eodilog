import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse, Trip } from '@/api/types';

import type { PlaceTimelineItem, TimelineItem, TripSummary } from './types';

/** 서버 최대 페이지 크기. 타임라인은 끝까지 읽어 한 화면에 그린다 */
const PAGE_LIMIT = 100;

/** GET /me/timeline 전부. 활성 여행·게시 전·날짜 미정 포함 */
export async function getMyTimeline(): Promise<TimelineItem[]> {
  const all: TimelineItem[] = [];
  let cursor: string | null = null;
  do {
    const { data }: { data: PageResponse<TimelineItem> } = await apiClient.get('/me/timeline', {
      params: { limit: PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
    });
    all.push(...data.data);
    cursor = data.page.hasNext ? data.page.nextCursor : null;
  } while (cursor);
  return all;
}

/** 여행 안 장소별 계획·방문·시각·사진 수. 일정 순 */
export async function getTripTimeline(tripId: string): Promise<PlaceTimelineItem[]> {
  const { data } = await apiClient.get<DataResponse<{ items: PlaceTimelineItem[] }>>(
    `/trips/${encodeURIComponent(tripId)}/timeline`,
  );
  return data.data.items;
}

export async function getTripSummary(tripId: string): Promise<TripSummary> {
  const { data } = await apiClient.get<DataResponse<TripSummary>>(
    `/trips/${encodeURIComponent(tripId)}/summary`,
  );
  return data.data;
}

/** 여행 이름·기간(GET /trips/{tripId}) */
export async function getSummaryTrip(tripId: string): Promise<Trip> {
  const { data } = await apiClient.get<DataResponse<Trip>>(`/trips/${encodeURIComponent(tripId)}`);
  return data.data;
}

/** 대표 사진: 여행 사진 중 맨 앞 한 장의 assetId. 없으면 null */
export async function getCoverAssetId(tripId: string): Promise<string | null> {
  const { data } = await apiClient.get<PageResponse<{ assetId: string }>>(
    `/trips/${encodeURIComponent(tripId)}/photos`,
    { params: { limit: 1 } },
  );
  return data.data[0]?.assetId ?? null;
}
