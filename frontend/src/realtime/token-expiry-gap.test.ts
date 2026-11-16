import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { IDLE, nextConnection, type ConnectionState } from './connection-machine';
import { createRealtimeClient, type StompCallbacks, type StompLike } from './realtime-client';

/**
 * 측정: access 토큰이 만료될 때 상대 메시지가 얼마나 멈추는가. 미리 갱신을 끈 것(고치기 전)과 켠 것(고친 뒤)을 같은 조건으로 잰다.
 *
 * 실제 realtime-client를 쓰고 서버·네트워크만 가짜다. 시간은 가짜 시계로 흘린다.
 * 걸리는 시간은 넣어 준 왕복 시간(갱신·연결·이어 받기)에 따라 정해지는 값이라, 실제 기기 측정값이 아니다.
 * 이 테스트로 확실히 알 수 있는 것은 순서와 횟수다: 서버가 끊은 횟수, 갱신 횟수, 늦게 보인 메시지 수
 */

const CHAT = '/user/queue/chat';
/** 상대가 메시지를 보내는 간격 */
const MESSAGE_EVERY_MS = 500;
/** 첫 토큰이 만료되기까지 */
const EXPIRES_AFTER_MS = 120_000;
const RUN_MS = 180_000;
/** 처음 연결과 첫 이어 받기가 끝날 때까지. 이 사이의 메시지는 세지 않는다 */
const WARM_UP_MS = 10_000;

type Latency = { refresh: number; connect: number; catchUp: number };

function simulate(latency: Latency, renewAhead: boolean) {
  const startedAt = Date.now();
  /** 토큰마다 만료 시각. 서버는 연결에 쓴 토큰의 만료 시각에 그 연결을 끊는다 */
  const expiresAt: Record<string, number> = {
    'token-1': startedAt + EXPIRES_AFTER_MS,
    'token-2': startedAt + EXPIRES_AFTER_MS + 3_600_000,
  };
  let state: ConnectionState = IDLE;
  let token = 'token-1';
  let refreshCount = 0;
  let connectionCount = 0;
  let forcedDrops = 0;
  /** 서버가 끊은 시각, 실시간이 다시 붙은 시각, 빠진 메시지를 다 받은 시각 */
  let droppedAt = 0;
  let resumedAt = 0;
  let caughtUpAt = 0;
  /** 화면 안내에 쓰는 연결 상태가 "다시 연결 중"으로 바뀐 횟수 */
  let reconnectingCount = 0;

  /** 서버가 보낸 메시지: 번호 → 보낸 시각 */
  const sentAt = new Map<number, number>();
  /** 화면에 보인 시각 */
  const shownAt = new Map<number, number>();
  const show = (seq: number) => {
    if (!shownAt.has(seq)) shownAt.set(seq, Date.now());
  };

  /** 지금 살아 있는 연결의 구독 콜백. 끊기면 비어 있다 */
  const live = new Set<(m: { body: string }) => void>();

  const createStomp = (callbacks: StompCallbacks): StompLike => {
    connectionCount += 1;
    let closed = false;
    let mine: ((m: { body: string }) => void) | null = null;
    return {
      activate: () => {
        // 웹소켓 연결 + CONNECT 왕복
        setTimeout(() => {
          if (closed) return;
          const used = callbacks.connectHeaders().Authorization?.replace('Bearer ', '') ?? '';
          callbacks.onConnect();
          setTimeout(
            () => {
              if (closed) return;
              forcedDrops += 1;
              droppedAt = Date.now();
              if (mine) live.delete(mine);
              callbacks.onStompError('UNAUTHENTICATED');
              callbacks.onWebSocketClose();
            },
            Math.max(expiresAt[used] - Date.now(), 0),
          );
        }, latency.connect);
      },
      deactivate: () => {
        closed = true;
        if (mine) live.delete(mine);
      },
      subscribe: (_destination, cb) => {
        mine = cb;
        live.add(cb);
        if (droppedAt > 0 && resumedAt === 0) resumedAt = Date.now();
        return { unsubscribe: () => undefined };
      },
    };
  };

  const client = createRealtimeClient({
    createStomp,
    getAccessToken: () => token,
    refreshAccessToken: () =>
      new Promise((resolve) => {
        refreshCount += 1;
        setTimeout(() => {
          token = 'token-2';
          resolve(token);
        }, latency.refresh);
      }),
    ...(renewAhead ? { getTokenExpiresAt: () => expiresAt[token] } : {}),
    connection: {
      get: () => state,
      dispatch: (event) => {
        const next = nextConnection(state, event);
        if (next.kind === 'reconnecting' && state.kind !== 'reconnecting') reconnectingCount += 1;
        state = next;
      },
    },
    now: () => Date.now(),
  });

  client.subscribe(CHAT, {
    onMessage: (body) => show((body as { seq: number }).seq),
    // 다시 연결되면 REST로 빠진 메시지를 받는다. 응답이 온 시점까지 서버에 있던 메시지가 모두 보인다
    onResync: () => {
      setTimeout(() => {
        for (const seq of sentAt.keys()) show(seq);
        if (droppedAt > 0 && caughtUpAt === 0) caughtUpAt = Date.now();
      }, latency.catchUp);
    },
  });

  client.start();

  // 상대가 일정 간격으로 보낸다. 살아 있는 연결이 있으면 바로 오고, 없으면 실시간으로는 오지 않는다
  let seq = 0;
  const sender = setInterval(() => {
    seq += 1;
    sentAt.set(seq, Date.now());
    for (const cb of [...live]) cb({ body: JSON.stringify({ seq }) });
  }, MESSAGE_EVERY_MS);

  return {
    finish() {
      clearInterval(sender);
      client.stop();
      // 앱을 막 켰을 때 처음 연결되기 전의 메시지는 만료와 상관없어 뺀다
      const delays = [...sentAt]
        .filter(([, at]) => at - startedAt > WARM_UP_MS)
        .map(([n, at]) => (shownAt.get(n) ?? Infinity) - at);
      const late = delays.filter((d) => d > 0);
      return {
        forcedDrops,
        refreshCount,
        connectionCount,
        reconnectingCount,
        realtimeStoppedMs: resumedAt - droppedAt,
        fullyRecoveredMs: caughtUpAt - droppedAt,
        sent: sentAt.size,
        shown: shownAt.size,
        lateMessages: late.length,
        maxDelayMs: late.length > 0 ? Math.max(...late) : 0,
      };
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const cases: [string, Latency][] = [
  ['왕복 100ms', { refresh: 100, connect: 100, catchUp: 100 }],
  ['왕복 300ms', { refresh: 300, connect: 300, catchUp: 300 }],
  ['왕복 1000ms', { refresh: 1000, connect: 1000, catchUp: 1000 }],
];

describe('토큰 만료 때 실시간이 멈추는 정도', () => {
  it.each(cases)('고치기 전(끊긴 뒤 갱신) %s', async (name, latency) => {
    const sim = simulate(latency, false);
    await jest.advanceTimersByTimeAsync(RUN_MS);
    const result = sim.finish();
    console.log(`[토큰 만료 측정] 전 ${name}: ${JSON.stringify(result)}`);

    // 만료 한 번에 서버가 한 번 끊고, 앱은 그 뒤에 한 번 갱신하고 새로 연결한다
    expect(result.forcedDrops).toBe(1);
    expect(result.refreshCount).toBe(1);
    expect(result.connectionCount).toBe(2);
    // 빠진 메시지는 없다. 늦게 보일 뿐이다
    expect(result.shown).toBe(result.sent);
    // 실시간이 멈춘 시간 = 갱신 + 다시 연결. 빠진 메시지까지 다 보이는 시간 = 거기에 이어 받기
    expect(result.realtimeStoppedMs).toBe(latency.refresh + latency.connect);
    expect(result.fullyRecoveredMs).toBe(latency.refresh + latency.connect + latency.catchUp);
  });

  it.each(cases)('고친 뒤(만료 전 미리 갱신) %s', async (name, latency) => {
    const sim = simulate(latency, true);
    await jest.advanceTimersByTimeAsync(RUN_MS);
    const result = sim.finish();
    console.log(`[토큰 만료 측정] 후 ${name}: ${JSON.stringify(result)}`);

    // 서버가 끊기 전에 앱이 먼저 갈아탄다. 갱신 횟수와 연결 수는 그대로다
    expect(result.forcedDrops).toBe(0);
    expect(result.refreshCount).toBe(1);
    expect(result.connectionCount).toBe(2);
    expect(result.reconnectingCount).toBe(0);
    expect(result.shown).toBe(result.sent);
    expect(result.lateMessages).toBe(0);
  });
});
