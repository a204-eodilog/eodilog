import type { QueryClient } from '@tanstack/react-query';

import { forgetTrip } from '@/features/trip/hooks/trip-cache';

import { forgetChatForTrip } from './chat-forget';
import { useChatBlocked } from './use-chat-blocked';

/**
 * 볼 수 없는 대화방이라는 응답(404 CHAT_ROOM_NOT_FOUND·TRIP_NOT_FOUND)을 받았을 때 정리한다(research R10).
 * 1. 차단 표시를 켜 화면이 다시 요청하지 않게 한다
 * 2. 그 여행의 캐시(['trips', tripId] 아래 대화방·메시지 포함)를 지운다
 * 3. 대화방 목록에서 빼고 보내는 중 메시지를 지운다
 */
export async function blockRoom(queryClient: QueryClient, tripId: string) {
  useChatBlocked.getState().block(tripId);
  forgetChatForTrip(queryClient, tripId);
  await forgetTrip(queryClient, tripId);
}
