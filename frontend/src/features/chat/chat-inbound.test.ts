import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';

import { getMessages } from './api';
import {
  catchUp,
  configureInbound,
  fillHoles,
  gapFillTiming,
  markRoomOpen,
  receive,
  requestHoleFill,
  resyncChat,
  tailCheckTiming,
  watchLatest,
} from './chat-inbound';
import { ME_QUERY_KEY } from '@/hooks/use-me';

import { CHAT_ROOMS_KEY, chatMessagesKey } from './hooks/chat-keys';
import { useChatOutbox } from './hooks/use-chat-outbox';
import { emptyWindow, mergeMessages } from './message-merge';
import { httpError, msg, range } from './testing';
import type { Message, MessagePage, MessageWindow } from './types';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('./api', () => ({ getMessages: jest.fn(), CATCH_UP_LIMIT: 100 }));

const mockGet = jest.mocked(getMessages);

/** 서버처럼 beforeSequence보다 작은 것을 limit개 내림차순으로. 방 전체 메시지는 1..total */
function server(total: number) {
  return async (
    _room: string,
    { beforeSequence, limit }: { beforeSequence?: number; limit: number },
  ) => {
    const top = Math.min(total, (beforeSequence ?? total + 1) - 1);
    const from = Math.max(1, top - limit + 1);
    return {
      data: range(from, top).reverse(),
      page: { nextBeforeSequence: from > 1 ? from : null, hasNext: from > 1 },
    } satisfies MessagePage;
  };
}

function setup(known: number, tripId = 'trip-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  qc.setQueryData<MessageWindow>(
    chatMessagesKey(tripId),
    mergeMessages(emptyWindow('room-1'), range(Math.max(1, known - 29), known)),
  );
  return qc;
}

const seqs = (qc: QueryClient, tripId = 'trip-1') =>
  qc.getQueryData<MessageWindow>(chatMessagesKey(tripId))!.messages.map((m) => m.sequence);

const quiet = { log: () => undefined };

beforeEach(() => {
  mockGet.mockReset();
  configureInbound(quiet);
});

describe('이어 받기', () => {
  it('빠진 250개는 최신 1번과 beforeSequence 2번으로 빠짐없이 오름차순이다', async () => {
    mockGet.mockImplementation(server(260));
    const qc = setup(10);
    const log = jest.fn();
    await catchUp(qc, 'trip-1', { log });
    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(mockGet.mock.calls.map((c) => c[1])).toEqual([
      { limit: 100 },
      { beforeSequence: 161, limit: 100 },
      { beforeSequence: 61, limit: 50 },
    ]);
    expect(seqs(qc)).toEqual(range(1, 260).map((m) => m.sequence));
    expect(log).toHaveBeenCalledWith('[chat] catch-up requests=3');
  });

  it('빠진 7개면 요청 1번이다', async () => {
    mockGet.mockImplementation(server(17));
    const qc = setup(10);
    await catchUp(qc, 'trip-1', quiet);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(seqs(qc).slice(-7)).toEqual([11, 12, 13, 14, 15, 16, 17]);
  });

  it('처음 받기 전(창이 없음)이면 요청하지 않는다', async () => {
    const qc = new QueryClient();
    await catchUp(qc, 'trip-1', quiet);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('같은 방 이어 받기는 겹쳐 돌리지 않는다', async () => {
    mockGet.mockImplementation(server(17));
    const qc = setup(10);
    await Promise.all([catchUp(qc, 'trip-1', quiet), catchUp(qc, 'trip-1', quiet)]);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('실패하면 stale로 두고, 볼 수 없는 대화방이면 차단 처리를 부른다', async () => {
    mockGet.mockRejectedValueOnce(httpError(null));
    const qc = setup(10);
    await catchUp(qc, 'trip-1', quiet);
    expect(qc.getQueryData<MessageWindow>(chatMessagesKey('trip-1'))!.stale).toBe(true);

    mockGet.mockRejectedValueOnce(httpError(404, 'CHAT_ROOM_NOT_FOUND'));
    const onBlocked = jest.fn();
    await catchUp(qc, 'trip-1', { ...quiet, onBlocked });
    expect(onBlocked).toHaveBeenCalledWith('trip-1');
  });
});

describe('빈칸 채우기', () => {
  it('실시간 하나를 빠뜨리면 요청 1번으로 채운다', async () => {
    mockGet.mockImplementation(server(12));
    const qc = setup(10);
    qc.setQueryData<MessageWindow>(chatMessagesKey('trip-1'), (w) =>
      mergeMessages(w!, range(12, 12)),
    );
    const log = jest.fn();
    await fillHoles(qc, 'trip-1', { log });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][1]).toEqual({ beforeSequence: 12, limit: 1 });
    expect(seqs(qc).slice(-3)).toEqual([10, 11, 12]);
    expect(log).toHaveBeenCalledWith('[chat] gap-fill requests=1');
  });
});

describe('다시 동기화', () => {
  it('대화방 목록을 다시 받게 하고, 열린 방만 이어 받고 나머지는 stale로 둔다(요청 0번)', async () => {
    mockGet.mockImplementation(server(12));
    const qc = setup(10, 'trip-open');
    qc.setQueryData<MessageWindow>(
      chatMessagesKey('trip-closed'),
      mergeMessages(emptyWindow('room-2'), range(1, 5, { roomId: 'room-2' })),
    );
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const close = markRoomOpen('trip-open');
    resyncChat(qc, quiet);
    await new Promise((r) => setTimeout(r, 0));
    close();
    expect(spy).toHaveBeenCalledWith({ queryKey: CHAT_ROOMS_KEY });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][0]).toBe('room-1');
    expect(qc.getQueryData<MessageWindow>(chatMessagesKey('trip-closed'))!.stale).toBe(true);
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

/** 서버 페이지를 바로 만든다(server와 같은 규칙) */
function pageOf(total: number, req: { beforeSequence?: number; limit: number }) {
  const top = Math.min(total, (req.beforeSequence ?? total + 1) - 1);
  const from = Math.max(1, top - req.limit + 1);
  return {
    data: range(from, top).reverse(),
    page: { nextBeforeSequence: from > 1 ? from : null, hasNext: from > 1 },
  } satisfies MessagePage;
}

/** 실시간 메시지 하나를 받는다(입구 하나 receive). 빈칸이 생기면 receive가 채우기를 예약하고, 그 작업을 jobs에 모은다 */
function deliver(qc: QueryClient, m: Message, jobs: Promise<void>[]) {
  receive(qc, 'trip-1', 'room-1', [m], 'realtime');
  jobs.push(requestHoleFill(qc, 'trip-1', quiet));
}

/** 같은 시드면 같은 순서가 나오는 난수 */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('채우는 중에 생긴 빈칸', () => {
  const previous = gapFillTiming.graceMs;
  beforeEach(() => {
    gapFillTiming.graceMs = 0;
  });
  afterEach(() => {
    gapFillTiming.graceMs = previous;
  });

  it('빈칸 채우기를 기다리는 사이 새 빈칸이 생기면 그것도 채운다', async () => {
    const qc = setup(10);
    const first = deferred<MessagePage>();
    mockGet.mockReturnValueOnce(first.promise);
    mockGet.mockImplementation(server(15));
    const jobs: Promise<void>[] = [];

    deliver(qc, msg(12), jobs); // 11이 빠짐 → 채우기 시작(응답 대기)
    deliver(qc, msg(15), jobs); // 13·14가 빠짐 → 두 번째 채우기
    first.resolve(pageOf(15, { beforeSequence: 12, limit: 1 }));
    await Promise.all(jobs);

    expect(seqs(qc).slice(-6)).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it('이어 받기를 기다리는 사이 생긴 빈칸도 채운다', async () => {
    const qc = setup(10);
    const latest = deferred<MessagePage>();
    mockGet.mockReturnValueOnce(latest.promise);
    mockGet.mockImplementation(server(14));
    const jobs: Promise<void>[] = [catchUp(qc, 'trip-1', quiet)];

    // 이어 받기의 최신 페이지는 1..12일 때 만들어졌고, 그 뒤 13은 실시간에서 놓치고 14만 왔다
    deliver(qc, msg(14), jobs);
    latest.resolve(pageOf(12, { limit: 100 }));
    await Promise.all(jobs);

    expect(seqs(qc).slice(-5)).toEqual([10, 11, 12, 13, 14]);
  });

  it('실시간 일부를 놓친 100번에서 빠지는 메시지가 없다', async () => {
    const random = seeded(208);
    let lost = 0;
    let trialsWithLoss = 0;
    let missedByRealtime = 0;
    let requests = 0;
    for (let trial = 0; trial < 100; trial += 1) {
      mockGet.mockReset();
      // 창에는 1..10, 서버에는 그 뒤 3~12개가 더 있다. 응답은 한 박자 늦게 온다(채우기가 서로 겹치게)
      const total = 10 + 3 + Math.floor(random() * 10);
      mockGet.mockImplementation(async (_room, req) => {
        await new Promise((r) => setTimeout(r, 0));
        return pageOf(total, req);
      });
      const qc = setup(10);
      const jobs: Promise<void>[] = [];
      // 절반은 다시 연결 직후처럼 이어 받기가 먼저 돌고 있다(최신 페이지는 그때까지의 메시지)
      if (random() < 0.5) {
        const snapshotTop = 10 + Math.floor(random() * (total - 10));
        mockGet.mockImplementationOnce(async (_room, req) => {
          await new Promise((r) => setTimeout(r, 0));
          return pageOf(snapshotTop, req);
        });
        jobs.push(catchUp(qc, 'trip-1', quiet));
      }
      // 실시간은 30%를 놓친다. 마지막 메시지는 온다(빈칸을 알아챌 수 있게)
      for (let s = 11; s <= total; s += 1) {
        if (s < total && random() < 0.3) {
          missedByRealtime += 1;
          continue;
        }
        deliver(qc, msg(s), jobs);
      }
      // 줄 선 작업이 다 끝날 때까지
      for (let i = 0; i < 20; i += 1) {
        await Promise.all(jobs);
        await new Promise((r) => setTimeout(r, 0));
      }
      const shown = new Set(seqs(qc));
      const before = lost;
      for (let s = 1; s <= total; s += 1) if (!shown.has(s)) lost += 1;
      if (lost > before) trialsWithLoss += 1;
      requests += mockGet.mock.calls.length;
    }
    // 측정 기록용(트러블슈팅 문서). 고치기 전 값과 비교한다
    console.log(
      `[measure] 100회 중 빠진 회차 ${trialsWithLoss}번, 실시간에서 놓친 ${missedByRealtime}개 중 끝내 빠짐 ${lost}개, 요청 ${requests}번`,
    );
    expect(lost).toBe(0);
  }, 60_000);
});

describe('어느 경로로 들어와도 보내는 중 말풍선 정리', () => {
  it('빈칸 채우기로 들어온 내 메시지는 실패 말풍선을 지운다(두 번 보이지 않음)', async () => {
    // 내 11번: 응답도 끊기고 실시간도 놓쳐 실패 말풍선으로 남았다. 12가 와서 빈칸 채우기로 11을 받는다
    const mine = msg(11, { senderId: 'me', clientMessageId: 'cid-x', text: '나' });
    mockGet.mockResolvedValue({ data: [mine], page: { nextBeforeSequence: null, hasNext: false } });
    const qc = setup(10);
    qc.setQueryData(ME_QUERY_KEY, { id: 'me' });
    useChatOutbox.getState().replace('room-1', [
      {
        clientMessageId: 'cid-x',
        roomId: 'room-1',
        text: '나',
        status: 'failed',
        failure: 'retry',
        queuedAt: 1,
      },
    ]);
    qc.setQueryData<MessageWindow>(chatMessagesKey('trip-1'), (w) => mergeMessages(w!, [msg(12)]));
    await fillHoles(qc, 'trip-1', quiet);
    expect(seqs(qc).slice(-3)).toEqual([10, 11, 12]);
    expect(useChatOutbox.getState().items['room-1']).toBeUndefined();
  });
});

describe('빈칸 채우기 대기', () => {
  const previous = gapFillTiming.graceMs;
  afterEach(() => {
    gapFillTiming.graceMs = previous;
  });

  it('뒤바뀌어 온 이벤트로 빈칸을 봤어도, 기다리는 사이 그 메시지가 오면 요청하지 않는다', async () => {
    gapFillTiming.graceMs = 20;
    mockGet.mockImplementation(server(12));
    const qc = setup(10);
    // 12가 11보다 먼저 왔다
    qc.setQueryData<MessageWindow>(chatMessagesKey('trip-1'), (w) => mergeMessages(w!, [msg(12)]));
    const job = requestHoleFill(qc, 'trip-1', quiet);
    qc.setQueryData<MessageWindow>(chatMessagesKey('trip-1'), (w) => mergeMessages(w!, [msg(11)]));
    await job;
    expect(mockGet).not.toHaveBeenCalled();
    expect(seqs(qc).slice(-3)).toEqual([10, 11, 12]);
  });

  it('기다린 뒤에도 비어 있으면 그때 요청 1번으로 채운다', async () => {
    gapFillTiming.graceMs = 20;
    mockGet.mockImplementation(server(12));
    const qc = setup(10);
    qc.setQueryData<MessageWindow>(chatMessagesKey('trip-1'), (w) => mergeMessages(w!, [msg(12)]));
    await requestHoleFill(qc, 'trip-1', quiet);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(seqs(qc).slice(-3)).toEqual([10, 11, 12]);
  });
});

describe('서버가 빈칸을 돌려주지 않을 때', () => {
  it('받은 페이지로 창이 바뀌지 않으면 같은 요청을 되풀이하지 않는다(요청 1번)', async () => {
    mockGet.mockResolvedValue({ data: [], page: { nextBeforeSequence: null, hasNext: false } });
    const qc = setup(10);
    qc.setQueryData<MessageWindow>(chatMessagesKey('trip-1'), (w) => mergeMessages(w!, [msg(12)]));
    await fillHoles(qc, 'trip-1', quiet);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

describe('마지막 메시지 유실', () => {
  const previous = { ...tailCheckTiming };
  afterEach(() => {
    Object.assign(tailCheckTiming, previous);
  });

  it('친구의 마지막 메시지 알림을 놓쳐 아무 신호가 없어도, 방이 열려 있으면 확인 간격 안에 채운다', async () => {
    tailCheckTiming.intervalMs = 20;
    // 창은 1..10. 서버에는 친구의 11이 있지만 실시간 알림을 놓쳤고, 그 뒤로 아무도 보내지 않는다
    mockGet.mockImplementation(server(11));
    const qc = setup(10);
    const stop = watchLatest(qc, 'trip-1', 'room-1', () => true);
    await new Promise((r) => setTimeout(r, 60));
    stop();
    expect(seqs(qc).slice(-2)).toEqual([10, 11]);
    expect(mockGet.mock.calls[0][1]).toEqual({ limit: 1 });
  });

  it('새 메시지가 없으면 최신 1개만 확인하고 창은 그대로다', async () => {
    tailCheckTiming.intervalMs = 20;
    mockGet.mockImplementation(server(10));
    const qc = setup(10);
    const before = qc.getQueryData<MessageWindow>(chatMessagesKey('trip-1'));
    const stop = watchLatest(qc, 'trip-1', 'room-1', () => true);
    await new Promise((r) => setTimeout(r, 30));
    stop();
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData<MessageWindow>(chatMessagesKey('trip-1'))).toBe(before);
  });

  it('앱이 백그라운드거나 연결이 끊긴 동안(isActive가 false)은 확인하지 않는다', async () => {
    tailCheckTiming.intervalMs = 10;
    mockGet.mockImplementation(server(11));
    const qc = setup(10);
    const stop = watchLatest(qc, 'trip-1', 'room-1', () => false);
    await new Promise((r) => setTimeout(r, 50));
    stop();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('방을 닫으면 확인을 멈춘다', async () => {
    tailCheckTiming.intervalMs = 10;
    mockGet.mockImplementation(server(10));
    const qc = setup(10);
    const stop = watchLatest(qc, 'trip-1', 'room-1', () => true);
    stop();
    await new Promise((r) => setTimeout(r, 50));
    expect(mockGet).not.toHaveBeenCalled();
  });
});
