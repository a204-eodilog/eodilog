import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { PageResponse } from '@/api/types';

import { latestOf } from '../message-merge';
import type { ChatRoom, Message } from '../types';

import { CHAT_ROOMS_KEY, chatRoomKey } from './chat-keys';

/** 대화방 목록·방 정보 캐시를 고치는 함수. 메시지 창은 chat-inbound.ts의 receive()만 고친다 */
type RoomsData = InfiniteData<PageResponse<ChatRoom>>;

/** 대화방 목록과 그 여행의 방 캐시에서 최근 메시지를 바꾼다. 더 큰 sequence만 이긴다 */
export function updateLastMessage(queryClient: QueryClient, tripId: string, message: Message) {
  queryClient.setQueryData<RoomsData>(CHAT_ROOMS_KEY, (old) =>
    old
      ? {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            data: p.data.map((room) =>
              room.id === message.roomId
                ? { ...room, lastMessage: latestOf(room.lastMessage, message) }
                : room,
            ),
          })),
        }
      : old,
  );
  queryClient.setQueryData<ChatRoom>(chatRoomKey(tripId), (room) =>
    room ? { ...room, lastMessage: latestOf(room.lastMessage, message) } : room,
  );
}

/** 대화방 목록에서 그 여행의 방을 바로 뺀다(차단·나가기) */
export function dropRoomFromList(queryClient: QueryClient, tripId: string) {
  queryClient.setQueryData<RoomsData>(CHAT_ROOMS_KEY, (old) =>
    old
      ? {
          ...old,
          pages: old.pages.map((p) => ({ ...p, data: p.data.filter((r) => r.tripId !== tripId) })),
        }
      : old,
  );
}
