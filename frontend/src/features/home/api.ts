import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse } from '@/api/types';

import type { DiscoveryItem, FeedCard, MapResult } from './types';

/**
 * 홈 지도. 2026-11-05 기준 백엔드에 컨트롤러가 없어 실패하면 화면은 '지도 로드 실패'로 보인다.
 * bbox는 지도 SDK 기준 명세라, SVG 지도는 처음부터 전국이 보여 전국 범위를 보낸다
 */
export async function getHomeMap(bbox: string): Promise<MapResult> {
  const { data } = await apiClient.get<DataResponse<MapResult>>('/home/map', { params: { bbox } });
  return data.data;
}

/** S06 같은 지역 여행 목록 첫 쪽. 지도와 같은 경로별 공개 판정 */
export async function getRegionFeeds(regionId: string): Promise<FeedCard[]> {
  const { data } = await apiClient.get<PageResponse<FeedCard>>(
    `/home/regions/${encodeURIComponent(regionId)}/feeds`,
    { params: { limit: 30 } },
  );
  return data.data;
}

/** 좋아요 기반 추천(첫 페이지만). 백엔드 컨트롤러 없음 */
export async function getDiscovery(): Promise<DiscoveryItem[]> {
  const { data } = await apiClient.get<PageResponse<DiscoveryItem>>(
    '/me/discovery-recommendations',
    { params: { limit: 10 } },
  );
  return data.data;
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

/** 팔로우한 사람이 있는지. 백엔드 컨트롤러 없음(실패하면 모름으로 둔다) */
export async function hasAnyFollowing(): Promise<boolean> {
  const { data } = await apiClient.get<PageResponse<unknown>>('/me/following', {
    params: { limit: 1 },
  });
  return data.data.length > 0;
}
