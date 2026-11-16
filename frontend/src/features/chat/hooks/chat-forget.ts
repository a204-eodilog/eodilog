import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { PageResponse } from '@/api/types';

import { useChatReads } from '../chat-reads';
import { forgetTripRooms, tripIdOf } from '../room-index';
import type { ChatRoom } from '../types';

import { dropRoomFromList } from './chat-cache';
import { CHAT_ROOMS_KEY, chatRoomKey } from './chat-keys';
import { useChatOutbox } from './use-chat-outbox';

/**
 * 여행에서 빠졌을 때(나가기·삭제·차단) 그 여행의 채팅 상태를 정리한다.
 * - 대화방 목록에서 그 방을 뺀다
 * - 그 방의 보내는 중 메시지를 지운다
 * - roomId → tripId 표에서 뺀다
 * ['trips', tripId] 아래 대화방·메시지 캐시는 forgetTrip이 지운다.
 * trip-cache.ts(exitTrip)가 이 함수를 부르므로 이 파일은 trip-cache.ts를 불러오지 않는다(순환 import 방지)
 */
export function forgetChatForTrip(queryClient: QueryClient, tripId: string) {
  // 대화방 화면을 연 적이 없으면 방 정보 캐시가 없다. 그때는 대화방 목록에서 찾는다(빼기 전에)
  const roomId =
    queryClient.getQueryData<ChatRoom>(chatRoomKey(tripId))?.id ??
    queryClient
      .getQueryData<InfiniteData<PageResponse<ChatRoom>>>(CHAT_ROOMS_KEY)
      ?.pages.flatMap((p) => p.data)
      .find((r) => r.tripId === tripId)?.id;
  dropRoomFromList(queryClient, tripId);
  const outbox = useChatOutbox.getState();
  for (const id of Object.keys(outbox.items)) {
    if (id === roomId || tripIdOf(id) === tripId) outbox.clearRoom(id);
  }
  // 안 읽은 수 기록도 지운다. 남기면 목록에 없는 방의 수가 채팅 탭 배지에 계속 더해진다
  const reads = useChatReads.getState();
  for (const id of Object.keys(reads.latest)) {
    if (id === roomId || tripIdOf(id) === tripId) reads.forgetRoom(id);
  }
  forgetTripRooms(tripId);
}
