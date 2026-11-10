import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse } from '@/api/types';

import type { DiscoveryItem, FeedCard, MapResult } from './types';

/**
 * 홈 지도. 팔로우한 사람이 동행인 게시 피드를 지역별로 묶어 준다.
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

/**
 * 홈 추천 시트(첫 페이지만). 내가 볼 수 있는 최근 30일 게시 피드를 좋아요 순으로, 장소는 그 피드에 많이 나온 순으로
 * 피드·장소를 번갈아 준다. 내가 동행인 여행은 빠진다
 */
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

/** 팔로우한 사람이 있는지. 실패하면 화면은 모름으로 둔다 */
export async function hasAnyFollowing(): Promise<boolean> {
  const { data } = await apiClient.get<PageResponse<unknown>>('/me/following', {
    params: { limit: 1 },
  });
  return data.data.length > 0;
}
