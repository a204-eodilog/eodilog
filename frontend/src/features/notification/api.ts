import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse } from '@/api/types';

import type { NotificationView, PollBrief } from './types';

const PAGE_SIZE = 20;

/** 내 알림 한 쪽. 서버는 최신부터 준다 */
export async function getNotifications(
  params: { cursor?: string | null; unreadOnly?: boolean } = {},
): Promise<PageResponse<NotificationView>> {
  const { data } = await apiClient.get<PageResponse<NotificationView>>('/me/notifications', {
    params: {
      limit: PAGE_SIZE,
      ...(params.unreadOnly ? { unreadOnly: true } : {}),
      ...(params.cursor ? { cursor: params.cursor } : {}),
    },
  });
  return data;
}

/** 알림 하나를 읽음으로. 이미 읽었으면 서버가 처음 읽은 시각을 그대로 준다 */
export async function readNotification(id: string): Promise<NotificationView> {
  const { data } = await apiClient.patch<DataResponse<NotificationView>>(
    `/me/notifications/${id}`,
    { read: true },
  );
  return data.data;
}

/**
 * 같은 소식(eventId)에서 나온 내 알림을 읽음으로. 채팅 시스템 카드를 열 때 알림과 읽음을 맞춘다.
 * 그 소식의 알림이 나에게 없으면 서버가 404(EVENT_NOT_FOUND)를 준다
 */
export async function readEvent(eventId: string): Promise<{ eventId: string; readAt: string }> {
  const { data } = await apiClient.post<DataResponse<{ eventId: string; readAt: string }>>(
    `/me/events/${encodeURIComponent(eventId)}/read`,
  );
  return data.data;
}

/** 내 목록에서 알림을 숨긴다(204) */
export async function dismissNotification(id: string): Promise<void> {
  await apiClient.delete(`/me/notifications/${id}`);
}

/** through 시각까지 만든 알림을 모두 읽음으로. 바뀐 수를 준다 */
export async function readAllNotifications(through: string): Promise<number> {
  const { data } = await apiClient.post<DataResponse<{ updatedCount: number }>>(
    '/me/notifications/read-all',
    { through },
  );
  return data.data.updatedCount;
}

/** S48 투표 시작 팝업의 투표 종류와 마감 시각 */
export async function getPollBrief(tripId: string, pollId: string): Promise<PollBrief> {
  const { data } = await apiClient.get<DataResponse<PollBrief>>(`/trips/${tripId}/polls/${pollId}`);
  return { type: data.data.type, closesAt: data.data.closesAt };
}
