import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { PageResponse, UserCard } from '@/api/types';
import { ME_QUERY_KEY } from '@/hooks/use-me';

import { getMessages, sendMessage } from './api';
import {
  configureInbound,
  gapFillTiming,
  markRoomOpen,
  resyncChat,
  tailCheckTiming,
  watchLatest,
} from './chat-inbound';
import { toChatItems } from './chat-items';
import { CHAT_ROOMS_KEY, chatMessagesKey, chatRoomKey } from './hooks/chat-keys';
import { useChatOutbox } from './hooks/use-chat-outbox';
import {
  autoResend,
  resendWaitingNow,
  stopAutoResend,
  useSendMessage,
} from './hooks/use-send-message';
import { emptyWindow, mergeMessages } from './message-merge';
import { applyChatEvent } from './realtime-chat';
import { clearRoomIndex, rememberRooms } from './room-index';
import { httpError, msg } from './testing';
import type { ChatRoom, Message, MessagePage, MessageWindow } from './types';

/**
 * 여러 사람이 같은 방에 동시에 보낼 때 내 화면이 맞는지 보는 시뮬레이션.
 * 앱 코드(보내기 훅·실시간 반영·빈칸 채우기·화면 줄 만들기)는 그대로 쓰고 서버만 흉내 낸다.
 * 가짜 서버는 저장하는 순간 순번을 하나씩 매기고(겹치지 않음), 실시간 이벤트를 늦게·뒤섞어·가끔 빠뜨려 보낸다.
 * 끝난 뒤 빠짐·중복·순서·두 번 보인 내 메시지·조회 요청을 센다.
 * 시간 축은 줄였다: 이벤트 지연 최대 8ms, 빈칸 채우기 대기 SIM_GRACE_MS(앱은 실제로 더 길게 기다린다)
 */

jest.mock('./api', () => ({
  getMessages: jest.fn(),
  sendMessage: jest.fn(),
  CATCH_UP_LIMIT: 100,
  FIRST_PAGE_LIMIT: 30,
  OLDER_PAGE_LIMIT: 50,
}));
jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('@/realtime', () => ({ realtime: { subscribe: jest.fn() } }));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `cid-${++n}` };
});

const mockGet = jest.mocked(getMessages);
const mockSend = jest.mocked(sendMessage);

const TRIP = 'trip-1';
const ROOM = 'room-1';
/** 빈칸 채우기 대기(시간 축을 줄인 값). 이벤트 지연 최대 8ms보다 길다 */
const SIM_GRACE_MS = 20;
/** 마지막 메시지 확인(시간 축을 줄인 값). false면 확인하지 않는다(고치기 전 동작) */
const SIM_TAIL_CHECK = true;
const SIM_TAIL_CHECK_MS = 40;
/** 자동 재전송 시간(시간 축을 줄인 값). 0이면 자동 재전송을 끈다(고치기 전 동작) */
const SIM_RESEND_WINDOW_MS = 2_000;

const person = (id: string): UserCard => ({
  id,
  nickname: id,
  profileImageUrl: null,
  accountVisibility: 'PUBLIC',
  followingStatus: 'NONE',
  followedByStatus: 'NONE',
});
const PEOPLE = ['me', 'b', 'c', 'd'].map(person);

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Scenario = {
  name: string;
  /** 실시간 이벤트가 늦게 오는 최대 ms(0이면 저장 순서대로 바로) */
  eventDelayMax: number;
  /** 실시간 이벤트를 빠뜨리는 비율 */
  eventLoss: number;
  /** 내 보내기 응답이 끊기는 비율(서버는 저장함) */
  responseLoss: number;
  /** 내 폰이 5ms부터 이 시간 동안 끊긴다(보내기는 서버에 닿지 못하고, 실시간도 못 받음). 0이면 안 끊김 */
  offlineMs?: number;
  /** 나는 보내지 않고 동행만 보낸다(내 보내기 응답이 빈칸을 드러내지 않게 해 마지막 메시지 유실만 본다) */
  friendsOnly?: boolean;
};

type Result = {
  trials: number;
  /** 서버에는 있는데 끝내 화면에 없는 메시지 */
  missing: number;
  trialsWithMissing: number;
  /** 같은 순번이 두 번 그려짐 */
  duplicates: number;
  /** 순번이 거꾸로 그려짐 */
  orderBroken: number;
  /** 서버 메시지로 보이는데 보내는 중(실패) 말풍선도 남은 내 메시지 */
  shownTwice: number;
  /** 조회 요청(빈칸 채우기·이어 받기). 실시간을 빠뜨리지 않았으면 모두 쓸데없는 요청이다 */
  fetches: number;
  /** 마지막 메시지 확인 요청(최신 1개). 방이 열려 있는 동안 간격마다 드는 비용 */
  tailChecks: number;
  /** 실패 말풍선에 사용자가 [다시 보내기]를 누른 횟수 */
  retries: number;
  /** [다시 보내기]를 누르기 전, 서버 메시지와 실패 말풍선으로 두 번 보인 내 메시지 */
  shownTwiceBeforeRetry: number;
  /** 내가 보낸 메시지 수 */
  mine: number;
  /** [다시 보내기]를 누르기 전까지 서버에 못 간 내 메시지(사용자가 직접 눌러야 감) */
  mineStuckBeforeTap: number;
  /** 서버에 두 번 저장된 내 메시지 */
  mineSavedTwice: number;
  /** 내 메시지가 서버에 저장된 순서가 쓴 순서와 다른 회차 */
  mineOrderBroken: number;
};

/** 서버 메시지로 보이는데 보내는 중(실패) 말풍선도 남은 내 메시지 수 */
function countShownTwice(qc: QueryClient) {
  const w = qc.getQueryData<MessageWindow>(chatMessagesKey(TRIP))!;
  const outbox = useChatOutbox.getState().items[ROOM] ?? [];
  const ids = new Set(w.messages.map((m) => m.clientMessageId));
  return outbox.filter((o) => ids.has(o.clientMessageId)).length;
}

async function runTrial(s: Scenario, random: () => number, r: Result) {
  const stored: Message[] = [];
  const byClientId = new Map<string, Message>();
  const base = Date.parse('2026-11-06T03:00:00Z');
  const at = (seq: number) => new Date(base + seq * 1000).toISOString();
  for (let i = 1; i <= 10; i += 1) stored.push(msg(i, { createdAt: at(i) }));

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const room: ChatRoom = {
    id: ROOM,
    type: 'TRIP',
    tripId: TRIP,
    participants: PEOPLE,
    lastMessage: stored[9],
  };
  qc.setQueryData(ME_QUERY_KEY, { id: 'me' });
  qc.setQueryData(chatRoomKey(TRIP), room);
  qc.setQueryData<InfiniteData<PageResponse<ChatRoom>>>(CHAT_ROOMS_KEY, {
    pages: [{ data: [room], page: { nextCursor: null, hasNext: false } }],
    pageParams: [null],
  });
  qc.setQueryData<MessageWindow>(
    chatMessagesKey(TRIP),
    mergeMessages(emptyWindow(ROOM), stored.slice(0, 10)),
  );
  clearRoomIndex();
  rememberRooms([room]);
  useChatOutbox.getState().clearAll();
  configureInbound({ log: () => undefined });
  // 대화방 화면처럼, 방이 열려 있고 연결된 동안 마지막 메시지를 확인한다
  const stopWatch = SIM_TAIL_CHECK
    ? watchLatest(qc, TRIP, ROOM, () => !offline())
    : () => undefined;
  const closeRoom = markRoomOpen(TRIP);
  const started = Date.now();
  const offlineFrom = 5;
  const offlineTo = 5 + (s.offlineMs ?? 0);
  const offline = () => {
    const t = Date.now() - started;
    return t >= offlineFrom && t < offlineTo;
  };
  if (s.offlineMs) {
    // 연결이 돌아오면 앱은 다시 구독하고 onResync를 부른다(startChatRealtime과 같음)
    void sleep(offlineTo).then(() => {
      resyncChat(qc, { log: () => undefined });
      void resendWaitingNow();
    });
  }

  /** 서버 저장. 순번은 저장하는 순간 하나씩 매긴다. 실시간은 늦게·가끔 빠뜨려 보낸다 */
  const save = (senderId: string, text: string, clientMessageId: string | null) => {
    const seq = stored.length + 1;
    const m = msg(seq, { senderId, text, clientMessageId, createdAt: at(seq) });
    stored.push(m);
    if (clientMessageId) byClientId.set(clientMessageId, m);
    if (random() >= s.eventLoss) {
      const delay = Math.floor(random() * (s.eventDelayMax + 1));
      void sleep(delay).then(() => {
        // 끊긴 동안 온 실시간은 못 받는다
        if (offline()) return;
        applyChatEvent(qc, { type: 'MESSAGE_CREATED', roomId: ROOM, message: m });
      });
    }
    return m;
  };

  mockGet.mockReset();
  mockGet.mockImplementation(async (_room, req) => {
    if (offline()) throw httpError(null);
    await sleep(Math.floor(random() * 3));
    const top = Math.min(stored.length, (req.beforeSequence ?? stored.length + 1) - 1);
    const from = Math.max(1, top - req.limit + 1);
    return {
      data: stored.slice(from - 1, top).reverse(),
      page: { nextBeforeSequence: from > 1 ? from : null, hasNext: from > 1 },
    } satisfies MessagePage;
  });
  mockSend.mockReset();
  mockSend.mockImplementation(async (_room, body) => {
    // 끊겨 있으면 서버에 닿지 못한다(저장 안 됨)
    if (offline()) throw httpError(null);
    await sleep(Math.floor(random() * 4));
    const m = byClientId.get(body.clientMessageId) ?? save('me', body.text, body.clientMessageId);
    await sleep(Math.floor(random() * 4));
    if (random() < s.responseLoss) throw httpError(null);
    return m;
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  let writtenOrder: string[] = [];
  const { result, unmount } = await renderHook(() => useSendMessage(TRIP, ROOM), { wrapper });

  await act(async () => {
    // 동행 3명이 3~6개씩, 나는 3~6개를 20ms 안에 섞어서 보낸다
    const sends: Promise<unknown>[] = [];
    for (const who of ['b', 'c', 'd']) {
      const n = 3 + Math.floor(random() * 4);
      for (let i = 0; i < n; i += 1) {
        sends.push(sleep(Math.floor(random() * 20)).then(() => save(who, `${who}-${i}`, null)));
      }
    }
    const mine = s.friendsOnly ? 0 : 3 + Math.floor(random() * 4);
    r.mine += mine;
    /** 내가 실제로 쓴 순서 */
    const written: string[] = [];
    writtenOrder = written;
    for (let i = 0; i < mine; i += 1) {
      sends.push(
        sleep(Math.floor(random() * 20)).then(() => {
          written.push(`me-${i}`);
          return result.current.send(`me-${i}`);
        }),
      );
    }
    await Promise.all(sends);
    // 늦은 이벤트·빈칸 채우기·자동 재전송이 다 끝날 때까지. 고정 시간 대신 보내는 중 메시지가 없어질 때까지 본다
    // (응답이 연달아 끊기면 자동 재전송이 15→30→60ms 간격으로 늘어 고정 시간을 넘길 수 있다. 최대 3초)
    await sleep(150);
    for (let i = 0; i < 60; i += 1) {
      const pending = (useChatOutbox.getState().items[ROOM] ?? []).some(
        (o) => o.status === 'sending',
      );
      if (!pending) break;
      await sleep(50);
    }
    await sleep(60);
    r.shownTwiceBeforeRetry += countShownTwice(qc);
    const savedMine = stored.filter((m) => m.senderId === 'me').length;
    r.mineStuckBeforeTap += mine - savedMine;
    // 응답이 끊긴 내 메시지는 실패 말풍선으로 남는다. 사용자가 [다시 보내기]를 누른다(최대 3번).
    // 서버가 이미 저장했으면 같은 번호표라 저장해 둔 메시지를 돌려준다
    for (let round = 0; round < 3; round += 1) {
      const failed = (useChatOutbox.getState().items[ROOM] ?? []).filter(
        (o) => o.status === 'failed',
      );
      if (failed.length === 0) break;
      for (const o of failed) {
        r.retries += 1;
        await result.current.retry(o.clientMessageId);
      }
      await sleep(150);
    }
  });

  const w = qc.getQueryData<MessageWindow>(chatMessagesKey(TRIP))!;
  const outbox = useChatOutbox.getState().items[ROOM] ?? [];
  const items = toChatItems(w, outbox, { meId: 'me', participants: PEOPLE });
  const shown = items.flatMap((i) => (i.kind === 'message' ? [i.message] : []));
  const shownSeqs = shown.map((m) => m.sequence);
  const seqSet = new Set(shownSeqs);

  const missing = stored.filter((m) => !seqSet.has(m.sequence)).length;
  r.missing += missing;
  if (missing > 0) r.trialsWithMissing += 1;
  r.duplicates += shownSeqs.length - seqSet.size;
  for (let i = 1; i < shownSeqs.length; i += 1) {
    if (shownSeqs[i] <= shownSeqs[i - 1]) r.orderBroken += 1;
  }
  const shownClientIds = new Set(shown.map((m) => m.clientMessageId));
  r.shownTwice += outbox.filter((o) => shownClientIds.has(o.clientMessageId)).length;
  const isTailCheck = (req: { beforeSequence?: number; limit: number }) =>
    req.beforeSequence === undefined && req.limit === 1;
  r.tailChecks += mockGet.mock.calls.filter((c) => isTailCheck(c[1])).length;
  r.fetches += mockGet.mock.calls.filter((c) => !isTailCheck(c[1])).length;
  const mineTexts = stored.filter((m) => m.senderId === 'me').map((m) => m.text!);
  r.mineSavedTwice += mineTexts.length - new Set(mineTexts).size;
  // 서버에 저장된 내 메시지 순서가 내가 쓴 순서와 같은지
  const savedOrder = writtenOrder.filter((t) => mineTexts.includes(t));
  if (savedOrder.join() !== mineTexts.join()) r.mineOrderBroken += 1;
  r.trials += 1;
  closeRoom();
  stopWatch();
  stopAutoResend();
  await unmount();
}

async function run(s: Scenario, trials = 50) {
  const random = seeded(208);
  const r: Result = {
    trials: 0,
    missing: 0,
    trialsWithMissing: 0,
    duplicates: 0,
    orderBroken: 0,
    shownTwice: 0,
    fetches: 0,
    tailChecks: 0,
    retries: 0,
    shownTwiceBeforeRetry: 0,
    mine: 0,
    mineStuckBeforeTap: 0,
    mineSavedTwice: 0,
    mineOrderBroken: 0,
  };
  for (let t = 0; t < trials; t += 1) await runTrial(s, random, r);
  // 측정 기록용(트러블슈팅 문서 C5)
  console.log(`[sim] ${s.name} ${JSON.stringify(r)}`);
  return r;
}

const previousGrace = gapFillTiming.graceMs;
const previousTail = tailCheckTiming.intervalMs;
const previousResend = { ...autoResend, delaysMs: [...autoResend.delaysMs] };
beforeAll(() => {
  gapFillTiming.graceMs = SIM_GRACE_MS;
  tailCheckTiming.intervalMs = SIM_TAIL_CHECK_MS;
  autoResend.windowMs = SIM_RESEND_WINDOW_MS;
  autoResend.delaysMs = [15, 30, 60];
});
afterAll(() => {
  gapFillTiming.graceMs = previousGrace;
  tailCheckTiming.intervalMs = previousTail;
  Object.assign(autoResend, previousResend);
});

describe('여러 사람이 동시에 보내기 (시뮬레이션, 50회씩)', () => {
  it('실시간이 저장 순서대로 오면 화면이 서버와 같고 조회 요청이 없다', async () => {
    const r = await run({ name: 'in-order', eventDelayMax: 0, eventLoss: 0, responseLoss: 0 });
    expect(r).toMatchObject({ missing: 0, duplicates: 0, orderBroken: 0, shownTwice: 0 });
    expect(r.fetches).toBe(0);
  }, 120_000);

  it('실시간이 뒤섞여 와도(빠뜨림 없음) 조회 요청을 하지 않는다', async () => {
    const r = await run({ name: 'out-of-order', eventDelayMax: 8, eventLoss: 0, responseLoss: 0 });
    expect(r).toMatchObject({ missing: 0, duplicates: 0, orderBroken: 0, shownTwice: 0 });
    expect(r.fetches).toBe(0);
  }, 120_000);

  it('실시간을 10% 빠뜨려도 빠지는 메시지가 없다', async () => {
    const r = await run({ name: 'loss10', eventDelayMax: 8, eventLoss: 0.1, responseLoss: 0 });
    expect(r).toMatchObject({ missing: 0, duplicates: 0, orderBroken: 0, shownTwice: 0 });
  }, 120_000);

  it('실시간 10% 유실과 내 응답 20% 끊김이 겹쳐도 빠짐·두 번 보임이 없다', async () => {
    const r = await run({ name: 'all', eventDelayMax: 8, eventLoss: 0.1, responseLoss: 0.2 });
    expect(r).toMatchObject({ missing: 0, duplicates: 0, orderBroken: 0, shownTwice: 0 });
    expect(r.shownTwiceBeforeRetry).toBe(0);
  }, 120_000);

  it('내 폰이 60ms 끊긴 사이 보낸 메시지는 연결이 돌아오면 저절로, 한 번씩, 순서대로 간다', async () => {
    const r = await run({
      name: 'offline60',
      eventDelayMax: 8,
      eventLoss: 0,
      responseLoss: 0,
      offlineMs: 60,
    });
    expect(r).toMatchObject({ missing: 0, duplicates: 0, orderBroken: 0, shownTwice: 0 });
    expect(r).toMatchObject({ mineStuckBeforeTap: 0, mineSavedTwice: 0, mineOrderBroken: 0 });
    expect(r.retries).toBe(0);
  }, 120_000);

  it('동행의 마지막 메시지 알림을 놓쳐 그 뒤로 아무 신호가 없어도 빠진 채 남지 않는다', async () => {
    const r = await run({
      name: 'tail-loss20',
      eventDelayMax: 8,
      eventLoss: 0.2,
      responseLoss: 0,
      friendsOnly: true,
    });
    expect(r).toMatchObject({ missing: 0, duplicates: 0, orderBroken: 0 });
  }, 120_000);
});
