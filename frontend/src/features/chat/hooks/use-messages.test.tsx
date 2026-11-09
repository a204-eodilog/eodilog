import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { getMessages } from '../api';
import { receive } from '../chat-inbound';
import { httpError, msg, range } from '../testing';
import type { MessagePage } from '../types';

import { blockRoom } from './block-room';
import { useMessages } from './use-messages';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('../api', () => ({
  getMessages: jest.fn(),
  FIRST_PAGE_LIMIT: 30,
  OLDER_PAGE_LIMIT: 50,
  CATCH_UP_LIMIT: 100,
}));

jest.mock('./block-room', () => ({ blockRoom: jest.fn(async () => undefined) }));

const mockGet = jest.mocked(getMessages);

/** 서버처럼 beforeSequence보다 작은 것을 limit개 내림차순으로. 방 전체 메시지는 1..total */
function serverPage(total: number) {
  return async (
    _room: string,
    { beforeSequence, limit }: { beforeSequence?: number; limit: number },
  ) => {
    const top = Math.min(total, (beforeSequence ?? total + 1) - 1);
    const from = Math.max(1, top - limit + 1);
    const data = range(from, top).reverse();
    return {
      data,
      page: { nextBeforeSequence: from > 1 ? from : null, hasNext: from > 1 },
    } satisfies MessagePage;
  };
}

function setup() {
  // gcTime Infinity: 캐시 정리 타이머가 남아 jest가 끝나지 않는 것을 막는다
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

beforeEach(() => {
  mockGet.mockReset();
});

describe('메시지 창', () => {
  it('처음 받기는 limit 30 한 번이고 창이 오름차순이다', async () => {
    mockGet.mockImplementation(serverPage(45));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useMessages('trip-1', 'room-1'), { wrapper });
    await waitFor(() => expect(result.current.window).toBeDefined());
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('room-1', { limit: 30 });
    const seqs = result.current.window!.messages.map((m) => m.sequence);
    expect(seqs[0]).toBe(16);
    expect(seqs[seqs.length - 1]).toBe(45);
    expect(result.current.window!.hasOlder).toBe(true);
  });

  it('loadOlder는 가장 작은 sequence 앞을 50개 받고, 처음까지 받으면 더 부르지 않는다', async () => {
    mockGet.mockImplementation(serverPage(45));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useMessages('trip-1', 'room-1'), { wrapper });
    await waitFor(() => expect(result.current.window).toBeDefined());
    await act(async () => {
      await result.current.loadOlder();
    });
    expect(mockGet).toHaveBeenLastCalledWith('room-1', { beforeSequence: 16, limit: 50 });
    expect(result.current.window!.oldestSequence).toBe(1);
    expect(result.current.window!.hasOlder).toBe(false);
    await act(async () => {
      await result.current.loadOlder();
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('loadOlder가 동시에 두 번 불려도 요청은 하나다', async () => {
    mockGet.mockImplementation(serverPage(100));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useMessages('trip-1', 'room-1'), { wrapper });
    await waitFor(() => expect(result.current.window).toBeDefined());
    await act(async () => {
      await Promise.all([result.current.loadOlder(), result.current.loadOlder()]);
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('loadOlder가 실패하면 error이고 창은 그대로다. 다시 부르면 같은 beforeSequence로 요청한다', async () => {
    mockGet.mockImplementation(serverPage(100));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useMessages('trip-1', 'room-1'), { wrapper });
    await waitFor(() => expect(result.current.window).toBeDefined());
    const before = result.current.window;
    mockGet.mockRejectedValueOnce(httpError(null));
    await act(async () => {
      await result.current.loadOlder();
    });
    expect(result.current.olderState).toBe('error');
    expect(result.current.window).toBe(before);
    await act(async () => {
      await result.current.loadOlder();
    });
    expect(mockGet.mock.calls[1][1]).toEqual({ beforeSequence: 71, limit: 50 });
    expect(mockGet.mock.calls[2][1]).toEqual({ beforeSequence: 71, limit: 50 });
    expect(result.current.olderState).toBe('idle');
  });

  it('볼 수 없는 대화방(404)이면 차단 상태가 되고 차단 정리를 부른다', async () => {
    mockGet.mockRejectedValue(httpError(404, 'CHAT_ROOM_NOT_FOUND'));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useMessages('trip-1', 'room-1'), { wrapper });
    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(blockRoom).toHaveBeenCalledWith(expect.anything(), 'trip-1');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

/** 응답 시점을 테스트가 정한다 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** 서버가 응답을 만든 순간의 최근 페이지. 1..upTo 중 최근 limit개 내림차순 */
function snapshot(upTo: number, limit = 30): MessagePage {
  const from = Math.max(1, upTo - limit + 1);
  return {
    data: range(from, upTo).reverse(),
    page: { nextBeforeSequence: from > 1 ? from : null, hasNext: from > 1 },
  };
}

/** 같은 시드면 같은 순서가 나오는 난수(측정을 다시 돌려도 같은 경우를 본다) */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('처음 받는 사이 실시간 메시지', () => {
  it('첫 응답이 그 메시지보다 먼저 만들어졌어도 화면에 남는다', async () => {
    const first = deferred<MessagePage>();
    mockGet.mockReturnValueOnce(first.promise);
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => useMessages('trip-1', 'room-1'), { wrapper });

    // 응답을 기다리는 사이 B의 11번이 실시간으로 온다. 서버 응답은 11번 저장 전(1..10)에 만들어졌다
    receive(queryClient, 'trip-1', 'room-1', [msg(11)], 'realtime');
    await act(async () => {
      first.resolve(snapshot(10));
    });

    await waitFor(() => expect(result.current.window).toBeDefined());
    const seqs = result.current.window!.messages.map((m) => m.sequence);
    expect(seqs).toEqual(range(1, 11).map((m) => m.sequence));
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('도착 시점을 섞은 100번에서 빠지는 메시지가 없고 요청은 매번 1번이다', async () => {
    const random = seeded(208);
    let lost = 0;
    let delivered = 0;
    let requests = 0;
    let trialsWithLoss = 0;
    for (let trial = 0; trial < 100; trial += 1) {
      mockGet.mockReset();
      // 방에는 메시지 10개가 있고, 첫 응답을 기다리는 사이 1~5개가 실시간으로 온다
      const arriving = 1 + Math.floor(random() * 5);
      // 그중 앞의 몇 개가 서버 응답에 이미 들어갔는지(응답을 만든 시점)
      const inSnapshot = Math.floor(random() * (arriving + 1));
      const first = deferred<MessagePage>();
      mockGet.mockReturnValueOnce(first.promise);
      const { queryClient, wrapper } = setup();
      const { result, unmount } = await renderHook(() => useMessages('trip-1', 'room-1'), {
        wrapper,
      });
      for (let s = 11; s <= 10 + arriving; s += 1) {
        receive(queryClient, 'trip-1', 'room-1', [msg(s)], 'realtime');
      }
      await act(async () => {
        first.resolve(snapshot(10 + inSnapshot));
      });
      await waitFor(() => expect(result.current.window).toBeDefined());
      const shown = new Set(result.current.window!.messages.map((m) => m.sequence));
      const before = lost;
      for (let s = 1; s <= 10 + arriving; s += 1) if (!shown.has(s)) lost += 1;
      if (lost > before) trialsWithLoss += 1;
      delivered += arriving;
      requests += mockGet.mock.calls.length;
      await unmount();
    }
    // 측정 기록용(트러블슈팅 문서). 고치기 전 값과 비교한다
    console.log(
      `[measure] 100회 중 빠진 회차 ${trialsWithLoss}번, 실시간 ${delivered}개 중 빠짐 ${lost}개, 요청 ${requests}번`,
    );
    expect(lost).toBe(0);
    expect(requests).toBe(100);
  }, 60_000);
});
