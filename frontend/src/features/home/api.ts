import { apiClient } from '@/api/client';
import { emptyIfMissing } from '@/api/missing';
import type { DataResponse, PageResponse } from '@/api/types';

import type { DiscoveryItem, FeedCard, MapResult } from './types';

const EMPTY_MAP: MapResult = {
  markers: [],
  criteria: { from: null, to: null, regionGrouping: '' },
  updatedAt: '',
};

/**
 * 홈 지도. 서버에 아직 없으면 빈 지도로 본다(친구 없음·공개 기록 없음 안내).
 * bbox는 지도 SDK 기준 명세라, SVG 지도는 처음부터 전국이 보여 전국 범위를 보낸다
 */
export function getHomeMap(bbox: string): Promise<MapResult> {
  return emptyIfMissing(
    apiClient
      .get<DataResponse<MapResult>>('/home/map', { params: { bbox } })
      .then(({ data }) => data.data),
    EMPTY_MAP,
  );
}

/** S06 같은 지역 여행 목록 첫 쪽. 지도와 같은 경로별 공개 판정 */
export async function getRegionFeeds(regionId: string): Promise<FeedCard[]> {
  const { data } = await apiClient.get<PageResponse<FeedCard>>(
    `/home/regions/${encodeURIComponent(regionId)}/feeds`,
    { params: { limit: 30 } },
  );
  return data.data;
}

/** 좋아요 기반 추천(첫 페이지만). 서버에 아직 없으면 추천 없음으로 본다 */
export function getDiscovery(): Promise<DiscoveryItem[]> {
  return emptyIfMissing(
    apiClient
      .get<PageResponse<DiscoveryItem>>('/me/discovery-recommendations', { params: { limit: 10 } })
      .then(({ data }) => data.data),
    [],
  );
}

/** 안 읽은 알림 수 (백엔드 있음) */
export async function getUnreadCount(): Promise<number> {
  const { data } = await apiClient.get<DataResponse<{ unreadCount: number }>>(
    '/me/notification-summary',
  );
  return data.data.unreadCount;
}

/** 내 여행이 하나라도 있는지. 없으면 첫 방문 화면 */
export async function hasAnyTrip(): Promise<boolean> {
  const { data } = await apiClient.get<PageResponse<unknown>>('/me/trips', {
    params: { limit: 1 },
  });
  return data.data.length > 0;
}

/** 팔로우한 사람이 있는지. 서버에 아직 없으면 없음으로 본다(다른 실패는 모름으로 둔다) */
export function hasAnyFollowing(): Promise<boolean> {
  return emptyIfMissing(
    apiClient
      .get<PageResponse<unknown>>('/me/following', { params: { limit: 1 } })
      .then(({ data }) => data.data.length > 0),
    false,
  );
}
