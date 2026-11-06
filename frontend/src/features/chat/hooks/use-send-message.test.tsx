import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { getMessages, sendMessage } from '../api';
import { configureInbound, gapFillTiming } from '../chat-inbound';
import { clearRoomIndex, rememberRooms } from '../room-index';
import { emptyWindow, mergeMessages } from '../message-merge';
import { httpError, msg } from '../testing';
import type { Message, MessageWindow, OutboxItem } from '../types';

import { chatMessagesKey } from './chat-keys';
import { restoreOutbox, useChatOutbox } from './use-chat-outbox';
import {
  attachSendEngine,
  autoResend,
  resendWaitingNow,
  stopAutoResend,
  useSendMessage,
} from './use-send-message';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('../api', () => ({
  sendMessage: jest.fn(),
  getMessages: jest.fn(async () => ({
    data: [],
    page: { nextBeforeSequence: null, hasNext: false },
  })),
  CATCH_UP_LIMIT: 100,
}));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `cid-${++n}` };
});

const mockSend = jest.mocked(sendMessage);

const ROOM = 'room-1';
const TRIP = 'trip-1';

/** 서버 흉내: 같은 clientMessageId·본문이면 처음 메시지를 돌려준다 */
function fakeServer() {
  const saved = new Map<string, Message>();
  let seq = 10;
  return async (_room: string, body: { clientMessageId: string; text: string }) => {
    const existing = saved.get(body.clientMessageId);
    if (existing) return existing;
    seq += 1;
    const m = msg(seq, { senderId: 'me', clientMessageId: body.clientMessageId, text: body.text });
    saved.set(body.clientMessageId, m);
    return m;
  };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  queryClient.setQueryData<MessageWindow>(
    chatMessagesKey(TRIP),
    mergeMessages(emptyWindow(ROOM), [msg(10)]),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const outbox = () => useChatOutbox.getState().items[ROOM] ?? [];
const windowOf = (qc: QueryClient) => qc.getQueryData<MessageWindow>(chatMessagesKey(TRIP))!;

const defaults = { ...autoResend, delaysMs: [...autoResend.delaysMs] };

beforeEach(() => {
  mockSend.mockReset();
  useChatOutbox.getState().clearAll();
});

const graceDefault = gapFillTiming.graceMs;

afterEach(() => {
  stopAutoResend();
  attachSendEngine(null);
  clearRoomIndex();
  Object.assign(autoResend, defaults);
  gapFillTiming.graceMs = graceDefault;
});

describe('보내기', () => {
  it('누르자마자 전송 중으로 들어가고, 201이면 서버 메시지로 바뀐다', async () => {
    const server = fakeServer();
    let respond: (() => void) | undefined;
    mockSend.mockImplementationOnce(
      (room, body) =>
        new Promise((resolve) => {
          respond = () => resolve(server(room, body));
        }),
    );
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => useSendMessage(TRIP, ROOM), { wrapper });
    let done: Promise<void> | undefined;
    await act(async () => {
      done = result.current.send('안녕');
    });
    // 서버가 아직 답하지 않았다
    expect(outbox()).toHaveLength(1);
    expect(outbox()[0]).toMatchObject({ status: 'sending', text: '안녕' });
    await act(async () => {
      respond!();
      await done;
    });
    expect(outbox()).toHaveLength(0);
    expect(windowOf(queryClient).messages.map((m) => m.text)).toContain('안녕');
  });

  it('자동 재전송 시간이 지났으면 네트워크 실패는 failed·retry이고, 다시 보내기는 같은 clientMessageId와 본문을 쓴다', async () => {
    autoResend.windowMs = 0;
    mockSend.mockRejectedValueOnce(httpError(null));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSendMessage(TRIP, ROOM), { wrapper });
    await act(async () => {
      await result.current.send('안녕');
    });
    expect(outbox()[0]).toMatchObject({ status: 'failed', failure: 'retry' });
    const id = outbox()[0].clientMessageId;
    mockSend.mockImplementation(fakeServer());
    await act(async () => {
      await result.current.retry(id);
    });
    expect(mockSend.mock.calls[0][1]).toEqual({ clientMessageId: id, text: '안녕' });
    expect(mockSend.mock.calls[1][1]).toEqual({ clientMessageId: id, text: '안녕' });
    expect(outbox()).toHaveLength(0);
  });

  it('서버가 저장했지만 응답이 실패한 경우, 다시 보내면 창에 메시지가 하나뿐이다', async () => {
    autoResend.windowMs = 0;
    const server = fakeServer();
    mockSend.mockImplementationOnce(async (room, body) => {
      await server(room, body);
      throw httpError(null);
    });
    mockSend.mockImplementation(server);
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => useSendMessage(TRIP, ROOM), { wrapper });
    await act(async () => {
      await result.current.send('한 번만');
    });
    await act(async () => {
      await result.current.retry(outbox()[0].clientMessageId);
    });
    expect(windowOf(queryClient).messages.filter((m) => m.text === '한 번만')).toHaveLength(1);
  });

  it('400·409면 rejected라 다시 보낼 수 없다', async () => {
    mockSend.mockRejectedValueOnce(httpError(400, 'VALIDATION_ERROR'));
    mockSend.mockRejectedValueOnce(httpError(409, 'CLIENT_MESSAGE_ID_REUSED'));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSendMessage(TRIP, ROOM), { wrapper });
    await act(async () => {
      await result.current.send('하나');
      await result.current.send('둘');
    });
    expect(outbox().map((i) => i.failure)).toEqual(['rejected', 'rejected']);
  });

  it('연달아 보내면 두 번째 요청은 첫 응답 뒤에 나가고, 첫 번째가 실패해도 두 번째는 보낸다', async () => {
    autoResend.windowMs = 0;
    let releaseFirst: (() => void) | undefined;
    mockSend.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          releaseFirst = () => reject(httpError(500, 'INTERNAL_ERROR'));
        }),
    );
    mockSend.mockImplementation(fakeServer());
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSendMessage(TRIP, ROOM), { wrapper });
    let second: Promise<void> | undefined;
    await act(async () => {
      void result.current.send('첫째');
      second = result.current.send('둘째');
      await Promise.resolve();
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    await act(async () => {
      releaseFirst!();
      await second;
    });
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(outbox().map((i) => [i.text, i.status])).toEqual([['첫째', 'failed']]);
  });

  it('404 CHAT_ROOM_NOT_FOUND면 차단 처리를 부른다', async () => {
    mockSend.mockRejectedValueOnce(httpError(404, 'CHAT_ROOM_NOT_FOUND'));
    const onBlocked = jest.fn();
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSendMessage(TRIP, ROOM, { onBlocked }), {
      wrapper,
    });
    await act(async () => {
      await result.current.send('막힘');
    });
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it('[지우기]는 이 기기 화면에서만 뺀다', async () => {
    mockSend.mockRejectedValueOnce(httpError(null));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSendMessage(TRIP, ROOM), { wrapper });
    await act(async () => {
      await result.current.send('지울 것');
    });
    await act(async () => result.current.discard(outbox()[0].clientMessageId));
    expect(outbox()).toHaveLength(0);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('내 응답이 다른 사람 메시지를 건너뛴 순번이면 그 빈칸을 채운다', async () => {
    gapFillTiming.graceMs = 0;
    configureInbound({ log: () => undefined });
    // 창은 10까지. 동시에 보낸 다른 사람의 11은 실시간에서 놓쳤고, 내 메시지는 12로 저장됐다
    mockSend.mockResolvedValue(msg(12, { senderId: 'me', clientMessageId: 'cid-x', text: '안녕' }));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSendMessage(TRIP, ROOM), { wrapper });
    await act(async () => {
      await result.current.send('안녕');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(jest.mocked(getMessages)).toHaveBeenCalledWith(ROOM, { beforeSequence: 12, limit: 1 });
  });

  it('내 응답이 바로 다음 순번이면 빈칸 채우기를 하지 않는다', async () => {
    gapFillTiming.graceMs = 0;
    jest.mocked(getMessages).mockClear();
    mockSend.mockImplementation(fakeServer());
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSendMessage(TRIP, ROOM), { wrapper });
    await act(async () => {
      await result.current.send('하나');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(jest.mocked(getMessages)).not.toHaveBeenCalled();
  });
});

describe('연결이 돌아오면 자동으로 다시 보내기', () => {
  it('네트워크 실패면 실패를 띄우지 않고 기다리다, 연결이 돌아오면 같은 번호표로 보낸다', async () => {
    mockSend.mockRejectedValueOnce(httpError(null));
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => useSendMessage(TRIP, ROOM), { wrapper });
    await act(async () => {
      await result.current.send('지하철에서');
    });
    expect(outbox()[0]).toMatchObject({ status: 'sending', waiting: true, failure: null });

    mockSend.mockImplementation(fakeServer());
    await act(async () => {
      await resendWaitingNow();
    });
    const [first, second] = mockSend.mock.calls.map((c) => c[1]);
    expect(second).toEqual(first);
    expect(outbox()).toHaveLength(0);
    expect(windowOf(queryClient).messages.filter((m) => m.text === '지하철에서')).toHaveLength(1);
  });

  it('서버는 저장했는데 응답만 끊겨도, 자동으로 다시 보낸 뒤 메시지는 하나뿐이다', async () => {
    const server = fakeServer();
    mockSend.mockImplementationOnce(async (room, body) => {
      await server(room, body);
      throw httpError(null);
    });
    mockSend.mockImplementation(server);
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => useSendMessage(TRIP, ROOM), { wrapper });
    await act(async () => {
      await result.current.send('한 번만');
      await resendWaitingNow();
    });
    expect(windowOf(queryClient).messages.filter((m) => m.text === '한 번만')).toHaveLength(1);
    expect(outbox()).toHaveLength(0);
  });

  it('기다리는 동안 쓴 다음 메시지는 앞 메시지보다 먼저 나가지 않는다', async () => {
    mockSend.mockRejectedValueOnce(httpError(null));
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => useSendMessage(TRIP, ROOM), { wrapper });
    await act(async () => {
      await result.current.send('첫째');
      // 네트워크가 돌아왔지만 아직 다시 보내기 전에 둘째를 쓴다
      mockSend.mockImplementation(fakeServer());
      await result.current.send('둘째');
    });
    // 둘째는 첫째를 기다린다(서버에 보내지 않음)
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(outbox().map((i) => [i.text, i.waiting])).toEqual([
      ['첫째', true],
      ['둘째', true],
    ]);
    await act(async () => {
      await resendWaitingNow();
    });
    expect(mockSend.mock.calls.slice(1).map((c) => c[1].text)).toEqual(['첫째', '둘째']);
    expect(
      windowOf(queryClient)
        .messages.slice(-2)
        .map((m) => m.text),
    ).toEqual(['첫째', '둘째']);
  });

  it('연결 신호가 없어도 정해진 간격이 지나면 다시 보낸다', async () => {
    autoResend.delaysMs = [10];
    mockSend.mockRejectedValueOnce(httpError(500, 'INTERNAL_ERROR'));
    mockSend.mockImplementation(fakeServer());
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSendMessage(TRIP, ROOM), { wrapper });
    await act(async () => {
      await result.current.send('서버가 잠깐 안 됨');
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(outbox()).toHaveLength(0);
  });

  it('정해진 시간이 지나도 못 보내면 그때 실패와 [다시 보내기]를 보인다', async () => {
    let now = 0;
    autoResend.now = () => now;
    mockSend.mockRejectedValue(httpError(null));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSendMessage(TRIP, ROOM), { wrapper });
    await act(async () => {
      await result.current.send('오래 끊김');
    });
    expect(outbox()[0]).toMatchObject({ status: 'sending', waiting: true });

    now = autoResend.windowMs - 1;
    await act(async () => {
      await resendWaitingNow();
    });
    expect(outbox()[0]).toMatchObject({ status: 'sending', waiting: true });

    now = autoResend.windowMs;
    await act(async () => {
      await resendWaitingNow();
    });
    expect(outbox()[0]).toMatchObject({ status: 'failed', failure: 'retry', waiting: false });
  });
});

describe('앱을 다시 켰을 때(보내는 중 메시지를 기기에 저장)', () => {
  const item = (over: Partial<OutboxItem>): OutboxItem => ({
    clientMessageId: 'cid-saved',
    roomId: ROOM,
    text: '꺼지기 전에 쓴 글',
    status: 'sending',
    failure: null,
    queuedAt: 7,
    ...over,
  });

  it('보내는 도중 앱이 꺼졌던 메시지는 "연결되면 보내요"로 되살리고, 번호는 저장된 것 다음부터 센다', () => {
    const restored = restoreOutbox(
      {
        [ROOM]: [
          item({}),
          item({ clientMessageId: 'cid-failed', status: 'failed', failure: 'retry', queuedAt: 9 }),
        ],
      },
      1_000,
    );
    expect(restored[ROOM][0]).toMatchObject({ waiting: true, retryingSince: 1_000 });
    expect(restored[ROOM][1]).toMatchObject({ status: 'failed', failure: 'retry' });
    useChatOutbox.getState().replace(ROOM, restored[ROOM]);
    const next = useChatOutbox.getState().enqueue(ROOM, '새 글');
    expect(next.queuedAt).toBeGreaterThan(9);
  });

  it('화면을 열지 않아도 연결이 돌아오면 저장돼 있던 메시지를 같은 번호표로 보낸다', async () => {
    const { queryClient } = setup();
    attachSendEngine(queryClient);
    rememberRooms([{ id: ROOM, tripId: TRIP }]);
    useChatOutbox
      .getState()
      .replace(ROOM, [item({ waiting: true, retryingSince: autoResend.now() })]);
    mockSend.mockImplementation(fakeServer());
    await resendWaitingNow();
    expect(mockSend.mock.calls[0][1]).toEqual({
      clientMessageId: 'cid-saved',
      text: '꺼지기 전에 쓴 글',
    });
    expect(outbox()).toHaveLength(0);
    expect(windowOf(queryClient).messages.map((m) => m.text)).toContain('꺼지기 전에 쓴 글');
  });

  it('방이 어느 여행인지 아직 모르면(대화방 목록을 받는 중) 조금 뒤 다시 시도한다', async () => {
    autoResend.delaysMs = [10];
    const { queryClient } = setup();
    attachSendEngine(queryClient);
    useChatOutbox
      .getState()
      .replace(ROOM, [item({ waiting: true, retryingSince: autoResend.now() })]);
    mockSend.mockImplementation(fakeServer());
    await resendWaitingNow();
    expect(mockSend).not.toHaveBeenCalled();
    rememberRooms([{ id: ROOM, tripId: TRIP }]);
    await new Promise((r) => setTimeout(r, 50));
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(outbox()).toHaveLength(0);
  });
});
