import { beforeEach, describe, expect, it } from '@jest/globals';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import type { PageResponse } from '@/api/types';

import { unreadOf, useChatReads } from '../chat-reads';
import { clearRoomIndex } from '../room-index';
import { msg } from '../testing';
import type { ChatRoom } from '../types';

import { forgetChatForTrip } from './chat-forget';
import { CHAT_ROOMS_KEY } from './chat-keys';

const room = (id: string, tripId: string): ChatRoom => ({
  id,
  type: 'TRIP',
  tripId,
  participants: [],
  lastMessage: msg(10, { roomId: id }),
});

beforeEach(() => {
  clearRoomIndex();
  useChatReads.getState().clearAll();
});

describe('여행에서 빠졌을 때 채팅 정리', () => {
  it('대화방 화면을 연 적이 없어도 그 방의 안 읽은 수를 지운다', () => {
    const qc = new QueryClient();
    qc.setQueryData<InfiniteData<PageResponse<ChatRoom>>>(CHAT_ROOMS_KEY, {
      pages: [
        {
          data: [room('room-a', 'trip-a'), room('room-b', 'trip-b')],
          page: { nextCursor: null, hasNext: false },
        },
      ],
      pageParams: [null],
    });
    const reads = useChatReads.getState();
    reads.noteRoom('room-a', 10);
    reads.noteMessage('room-a', 13, false);
    reads.noteRoom('room-b', 10);
    reads.noteMessage('room-b', 11, false);

    forgetChatForTrip(qc, 'trip-a');

    const { latest, read } = useChatReads.getState();
    expect(latest['room-a']).toBeUndefined();
    expect(unreadOf(latest['room-b'], read['room-b'])).toBe(1);
  });
});
