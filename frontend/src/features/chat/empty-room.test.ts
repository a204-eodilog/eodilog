import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';

import { getMessages } from './api';
import { catchUp, checkLatest, configureInbound, receive } from './chat-inbound';
import { chatMessagesKey } from './hooks/chat-keys';
import { emptyWindow, mergeMessages } from './message-merge';
import { msg, range } from './testing';
import type { MessagePage, MessageWindow } from './types';

/**
 * 처음 열 때 비어 있던 대화방(2026-11-10 점검).
 * 메시지가 없는 창은 "어디까지 받았나"가 없어 이어 받기와 마지막 메시지 확인을 건너뛰었다.
 * 그래서 앱을 내려 두었다 돌아오거나 실시간 알림을 놓치면, 방을 다시 열 때까지 새 메시지가 보이지 않았다
 */

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('./api', () => ({ getMessages: jest.fn(), CATCH_UP_LIMIT: 100 }));

const mockGet = jest.mocked(getMessages);

/** 방 전체 메시지가 1..total인 서버. total이 0이면 빈 방이다 */
function server(total: number) {
  return async (
    _room: string,
    { beforeSequence, limit }: { beforeSequence?: number; limit: number },
  ) => {
    const top = Math.min(total, (beforeSequence ?? total + 1) - 1);
    const from = Math.max(1, top - limit + 1);
    return {
      data: top >= from ? range(from, top).reverse() : [],
      page: { nextBeforeSequence: from > 1 ? from : null, hasNext: from > 1 },
    } satisfies MessagePage;
  };
}

/** 처음 받기가 빈 응답으로 끝난 방. 서버에 더 오래된 메시지가 없다 */
function emptyRoom() {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  qc.setQueryData<MessageWindow>(
    chatMessagesKey('trip-1'),
    mergeMessages(emptyWindow('room-1'), [], { hasOlder: false }),
  );
  return qc;
}

const win = (qc: QueryClient) => qc.getQueryData<MessageWindow>(chatMessagesKey('trip-1'));
const seqs = (qc: QueryClient) => win(qc)!.messages.map((m) => m.sequence);

beforeEach(() => {
  mockGet.mockReset();
  configureInbound({ log: () => undefined });
});

describe('처음에 비어 있던 대화방', () => {
  it('이어 받기는 요청 1번으로 그사이 온 메시지를 채운다', async () => {
    mockGet.mockImplementation(server(3));
    const qc = emptyRoom();
    await catchUp(qc, 'trip-1');
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][1]).toEqual({ limit: 100 });
    expect(seqs(qc)).toEqual([1, 2, 3]);
    expect(win(qc)!.stale).toBe(false);
  });

  it('그사이 온 메시지가 한 페이지를 넘으면 더 오래된 메시지가 있다고 적어 둔다', async () => {
    mockGet.mockImplementation(server(150));
    const qc = emptyRoom();
    await catchUp(qc, 'trip-1');
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(seqs(qc)).toEqual(range(51, 150).map((m) => m.sequence));
    expect(win(qc)!.hasOlder).toBe(true);
  });

  it('아직 아무도 말하지 않았으면 이어 받기 뒤에도 빈 방이다', async () => {
    mockGet.mockImplementation(server(0));
    const qc = emptyRoom();
    await catchUp(qc, 'trip-1');
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(seqs(qc)).toEqual([]);
    expect(win(qc)!.hasOlder).toBe(false);
  });

  it('마지막 메시지 확인도 빈 방에서 돌아 놓친 메시지를 채운다', async () => {
    mockGet.mockImplementation(server(2));
    const qc = emptyRoom();
    await checkLatest(qc, 'trip-1', 'room-1');
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(seqs(qc)).toEqual([1, 2]);
  });

  it('실시간으로 온 메시지 3개가 보낸 순서대로 3개 보인다', () => {
    const qc = emptyRoom();
    receive(qc, 'trip-1', 'room-1', [msg(1)], 'realtime');
    receive(qc, 'trip-1', 'room-1', [msg(2)], 'realtime');
    receive(qc, 'trip-1', 'room-1', [msg(3)], 'realtime');
    expect(seqs(qc)).toEqual([1, 2, 3]);
  });

  it('내 첫 메시지는 보내기 응답과 실시간으로 두 번 와도 한 번만 보인다', () => {
    const qc = emptyRoom();
    const mine = msg(1);
    receive(qc, 'trip-1', 'room-1', [mine], 'send');
    receive(qc, 'trip-1', 'room-1', [mine], 'realtime');
    receive(qc, 'trip-1', 'room-1', [msg(2)], 'realtime');
    expect(seqs(qc)).toEqual([1, 2]);
  });

  it('열어 본 적 없는 방(창 없음)은 이어 받기도 확인도 하지 않는다', async () => {
    mockGet.mockImplementation(server(3));
    const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    await catchUp(qc, 'trip-1');
    await checkLatest(qc, 'trip-1', 'room-1');
    expect(mockGet).not.toHaveBeenCalled();
    expect(win(qc)).toBeUndefined();
  });
});
