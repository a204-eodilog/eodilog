import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { PageResponse } from '@/api/types';

import { getChatRooms } from '../api';
import { unreadOf, useChatReads } from '../chat-reads';
import { clearRoomIndex, tripIdOf } from '../room-index';
import { msg } from '../testing';
import type { ChatRoom } from '../types';

import { useChatRooms } from './use-chat-rooms';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('../api', () => ({ getChatRooms: jest.fn() }));
jest.mock('@/hooks/use-me', () => ({ useMe: () => ({ data: { id: 'me' } }) }));
jest.mock('@/features/trip/hooks/use-my-trips', () => ({
  useMyTrips: () => ({ data: undefined, listState: { kind: 'loading' }, today: '2026-11-16' }),
}));

const room = (id: string, tripId: string, sequence: number): ChatRoom => ({
  id,
  type: 'TRIP',
  tripId,
  participants: [],
  lastMessage: msg(sequence, { roomId: id }),
});

const page = (rooms: ChatRoom[], hasNext: boolean): PageResponse<ChatRoom> => ({
  data: rooms,
  page: { nextCursor: hasNext ? 'next' : null, hasNext },
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const unread = (roomId: string) => {
  const { latest, read } = useChatReads.getState();
  return unreadOf(latest[roomId], read[roomId]);
};

beforeEach(() => {
  clearRoomIndex();
  useChatReads.getState().clearAll();
  jest.mocked(getChatRooms).mockReset();
});

describe('대화방 목록을 받으면 나간 방의 안 읽은 수를 정리한다', () => {
  it('방 캐시도 방 표도 없이 센 방이 목록에 없으면, 목록을 끝까지 받은 뒤 지운다', async () => {
    // 채팅 탭을 열기 전에 실시간으로 센 메시지(그 뒤 이 여행에서 나갔다)
    useChatReads.getState().noteMessage('room-gone', 7, false);
    expect(tripIdOf('room-gone')).toBeUndefined();
    expect(unread('room-gone')).toBe(1);

    jest
      .mocked(getChatRooms)
      .mockResolvedValueOnce(page([room('room-a', 'trip-a', 3)], true))
      .mockResolvedValueOnce(page([room('room-b', 'trip-b', 5)], false));
    renderHook(() => useChatRooms(), { wrapper });

    await waitFor(() => expect(useChatReads.getState().latest['room-gone']).toBeUndefined());
    expect(useChatReads.getState().latest['room-a']).toBe(3);
    expect(useChatReads.getState().latest['room-b']).toBe(5);
  });

  it('목록을 다 받기 전에는 지우지 않는다', async () => {
    useChatReads.getState().noteMessage('room-b', 6, false);
    let finish: (value: PageResponse<ChatRoom>) => void = () => undefined;
    jest
      .mocked(getChatRooms)
      .mockResolvedValueOnce(page([room('room-a', 'trip-a', 3)], true))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
    renderHook(() => useChatRooms(), { wrapper });

    // 첫 쪽만 받았다: 둘째 쪽에 있을 room-b를 지우면 안 된다
    await waitFor(() => expect(useChatReads.getState().latest['room-a']).toBe(3));
    expect(unread('room-b')).toBe(1);

    finish(page([room('room-b', 'trip-b', 6)], false));
    await waitFor(() => expect(useChatReads.getState().latest['room-b']).toBe(6));
    expect(unread('room-b')).toBe(1);
  });
});
