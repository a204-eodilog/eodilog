import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import type { PageResponse } from '@/api/types';

import { rememberRooms, tripIdOf } from '../room-index';
import type { ChatRoom } from '../types';

import { blockRoom } from './block-room';
import { CHAT_ROOMS_KEY, chatMessagesKey, chatRoomKey } from './chat-keys';
import { useChatBlocked } from './use-chat-blocked';
import { useChatOutbox } from './use-chat-outbox';

jest.mock('@/features/trip/hooks/trip-cache', () => ({
  forgetTrip: jest.fn(async (qc: QueryClient, tripId: string) => {
    qc.removeQueries({ queryKey: ['trips', tripId] });
  }),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'cid-1' }));

const room = (id: string, tripId: string): ChatRoom => ({
  id,
  type: 'TRIP',
  tripId,
  participants: [],
  lastMessage: null,
});

beforeEach(() => {
  useChatBlocked.getState().clearAll();
  useChatOutbox.getState().clearAll();
});

describe('차단 정리', () => {
  it('대화방·메시지 캐시를 지우고, 목록에서 빼고, 보내는 중 큐를 비우고, 차단 표시를 켠다', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    qc.setQueryData<InfiniteData<PageResponse<ChatRoom>>>(CHAT_ROOMS_KEY, {
      pages: [
        { data: [room('r1', 't1'), room('r2', 't2')], page: { nextCursor: null, hasNext: false } },
      ],
      pageParams: [null],
    });
    qc.setQueryData(chatRoomKey('t1'), room('r1', 't1'));
    qc.setQueryData(chatMessagesKey('t1'), { roomId: 'r1', messages: [] });
    rememberRooms([room('r1', 't1')]);
    useChatOutbox.getState().enqueue('r1', '보내는 중');

    await blockRoom(qc, 't1');

    expect(qc.getQueryData(chatRoomKey('t1'))).toBeUndefined();
    expect(qc.getQueryData(chatMessagesKey('t1'))).toBeUndefined();
    const list = qc.getQueryData<InfiniteData<PageResponse<ChatRoom>>>(CHAT_ROOMS_KEY)!;
    expect(list.pages[0].data.map((r) => r.tripId)).toEqual(['t2']);
    expect(useChatOutbox.getState().items.r1).toBeUndefined();
    expect(tripIdOf('r1')).toBeUndefined();
    expect(useChatBlocked.getState().trips.t1).toBe(true);
  });

  it('다시 참여해 목록에 나타나면 차단 표시를 푼다', () => {
    useChatBlocked.getState().block('t1');
    useChatBlocked.getState().unblock(['t1', 't9']);
    expect(useChatBlocked.getState().trips.t1).toBeUndefined();
  });
});
