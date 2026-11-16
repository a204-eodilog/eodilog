import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { IDLE, nextConnection, type ConnectionState } from './connection-machine';
import {
  createRealtimeClient,
  RENEW_AHEAD_MS,
  type RealtimeDeps,
  type StompCallbacks,
  type StompLike,
} from './realtime-client';

const CHAT = '/user/queue/chat';

type FakeStomp = StompLike & {
  callbacks: StompCallbacks;
  headers: Record<string, string> | null;
  subscribed: string[];
  deliver(destination: string, body: unknown): void;
  connect(): void;
  close(): void;
  error(code: string): void;
};

function setup(over: Partial<RealtimeDeps> = {}) {
  const instances: FakeStomp[] = [];
  let state: ConnectionState = IDLE;
  let token = 'token-1';
  const refresh = jest.fn<() => Promise<string | null>>(async () => {
    token = 'token-2';
    return token;
  });
  const deps: RealtimeDeps = {
    createStomp: (callbacks) => {
      const listeners = new Map<string, (m: { body: string }) => void>();
      const fake: FakeStomp = {
        callbacks,
        headers: null,
        subscribed: [],
        activate: jest.fn(),
        deactivate: jest.fn(),
        subscribe: (destination, cb) => {
          fake.subscribed.push(destination);
          listeners.set(destination, cb);
          return { unsubscribe: () => listeners.delete(destination) };
        },
        deliver: (destination, body) =>
          listeners.get(destination)?.({ body: JSON.stringify(body) }),
        connect: () => {
          fake.headers = callbacks.connectHeaders();
          callbacks.onConnect();
        },
        close: () => callbacks.onWebSocketClose(),
        error: (code) => callbacks.onStompError(code),
      };
      instances.push(fake);
      return fake;
    },
    getAccessToken: () => token,
    refreshAccessToken: refresh,
    connection: {
      get: () => state,
      dispatch: (event) => {
        state = nextConnection(state, event);
      },
    },
    now: () => 1000,
    ...over,
  };
  const client = createRealtimeClient(deps);
  return {
    client,
    refresh,
    instances,
    latest: () => instances[instances.length - 1],
    state: () => state,
  };
}

/** 마이크로태스크(토큰 갱신 await)를 비운다 */
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('실시간 클라이언트', () => {
  it('연결 헤더에 최신 access 토큰이 들어간다', () => {
    const t = setup();
    t.client.start();
    t.latest().connect();
    expect(t.latest().headers).toEqual({ Authorization: 'Bearer token-1' });
    expect(t.state()).toEqual({ kind: 'connected' });
  });

  it('처음 연결에도 구독한 뒤 onResync를 한 번 부른다', () => {
    const t = setup();
    const onResync = jest.fn();
    const onMessage = jest.fn();
    t.client.subscribe(CHAT, { onMessage, onResync });
    t.client.start();
    t.latest().connect();
    expect(t.latest().subscribed).toEqual([CHAT]);
    expect(onResync).toHaveBeenCalledTimes(1);
    t.latest().deliver(CHAT, { type: 'MESSAGE_CREATED' });
    expect(onMessage).toHaveBeenCalledWith({ type: 'MESSAGE_CREATED' });
  });

  it('끊기면 간격을 두고 새 연결을 만들고, 다시 구독한 뒤 onResync를 부른다', () => {
    const t = setup();
    const onResync = jest.fn();
    t.client.subscribe(CHAT, { onMessage: jest.fn(), onResync });
    t.client.start();
    t.latest().connect();
    t.latest().close();
    expect(t.state()).toEqual({ kind: 'reconnecting', attempt: 1, since: 1000 });
    expect(t.instances).toHaveLength(1);
    jest.advanceTimersByTime(999);
    expect(t.instances).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(t.instances).toHaveLength(2);
    t.latest().connect();
    expect(t.latest().subscribed).toEqual([CHAT]);
    expect(onResync).toHaveBeenCalledTimes(2);
  });

  it('같은 목적지를 두 번 등록하면 SUBSCRIBE는 한 번이고 둘 다 받는다. 하나를 풀어도 남은 쪽은 받는다', () => {
    const t = setup();
    const a = jest.fn();
    const b = jest.fn();
    const offA = t.client.subscribe(CHAT, { onMessage: a });
    t.client.subscribe(CHAT, { onMessage: b });
    t.client.start();
    t.latest().connect();
    expect(t.latest().subscribed).toEqual([CHAT]);
    t.latest().deliver(CHAT, 1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    t.latest().deliver(CHAT, 2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('허용되지 않은 목적지는 오류를 내고 연결은 그대로다', () => {
    const t = setup();
    t.client.start();
    t.latest().connect();
    expect(() => t.client.subscribe('/topic/votes', { onMessage: jest.fn() })).toThrow();
    expect(t.state()).toEqual({ kind: 'connected' });
  });

  it('ERROR UNAUTHENTICATED면 토큰을 한 번 갱신하고 새 토큰으로 다시 연결한다', async () => {
    const t = setup();
    t.client.start();
    t.latest().connect();
    t.latest().error('UNAUTHENTICATED');
    t.latest().close(); // 서버가 ERROR 뒤 연결을 닫는다. 갱신 중이라 끊김으로 다루지 않는다
    await flush();
    expect(t.refresh).toHaveBeenCalledTimes(1);
    expect(t.instances).toHaveLength(2);
    t.latest().connect();
    expect(t.latest().headers).toEqual({ Authorization: 'Bearer token-2' });
  });

  it('갱신이 null이면 멈춘다', async () => {
    const t = setup({ refreshAccessToken: async () => null });
    t.client.start();
    t.latest().connect();
    t.latest().error('UNAUTHENTICATED');
    await flush();
    expect(t.state()).toEqual({ kind: 'stopped', reason: 'auth' });
    jest.advanceTimersByTime(60_000);
    expect(t.instances).toHaveLength(1);
  });

  it('갱신 뒤 연결 성공 없이 또 UNAUTHENTICATED면 멈춘다', async () => {
    const t = setup();
    t.client.start();
    t.latest().error('UNAUTHENTICATED');
    await flush();
    t.latest().error('UNAUTHENTICATED');
    await flush();
    expect(t.refresh).toHaveBeenCalledTimes(1);
    expect(t.state()).toEqual({ kind: 'stopped', reason: 'auth' });
  });

  it('갱신 → 연결 성공 → 한참 뒤 UNAUTHENTICATED면 다시 갱신하고 멈추지 않는다', async () => {
    const t = setup();
    t.client.start();
    t.latest().error('UNAUTHENTICATED');
    await flush();
    t.latest().connect();
    t.latest().error('UNAUTHENTICATED');
    await flush();
    expect(t.refresh).toHaveBeenCalledTimes(2);
    expect(t.state().kind).not.toBe('stopped');
  });

  it('PROFILE_INCOMPLETE·FORBIDDEN이면 멈춘다', () => {
    const t = setup();
    t.client.start();
    t.latest().error('FORBIDDEN');
    expect(t.state()).toEqual({ kind: 'stopped', reason: 'forbidden' });
  });

  it('pause면 끊고 paused, resume이면 다시 연결한 뒤 onResync를 부른다', () => {
    const t = setup();
    const onResync = jest.fn();
    t.client.subscribe(CHAT, { onMessage: jest.fn(), onResync });
    t.client.start();
    t.latest().connect();
    t.client.pause();
    expect(t.state()).toEqual({ kind: 'paused' });
    expect(t.instances[0].deactivate).toHaveBeenCalled();
    t.latest().close(); // 끊은 뒤 늦게 온 닫힘은 무시한다
    jest.advanceTimersByTime(60_000);
    expect(t.instances).toHaveLength(1);
    t.client.resume();
    expect(t.instances).toHaveLength(2);
    t.latest().connect();
    expect(onResync).toHaveBeenCalledTimes(2);
  });

  it('stop 뒤에는 다시 연결하지 않는다', () => {
    const t = setup();
    t.client.start();
    t.latest().connect();
    t.client.stop();
    expect(t.state()).toEqual(IDLE);
    t.client.resume();
    jest.advanceTimersByTime(60_000);
    expect(t.instances).toHaveLength(1);
  });

  it('네트워크가 끊긴 동안은 시도하지 않고, 돌아오면 바로 시도한다', () => {
    const t = setup();
    t.client.start();
    t.latest().connect();
    t.client.setOnline(false);
    t.latest().close();
    jest.advanceTimersByTime(60_000);
    expect(t.instances).toHaveLength(1);
    t.client.setOnline(true);
    expect(t.instances).toHaveLength(2);
  });
});

describe('반쯤 끊긴 연결: 네트워크가 바뀌면 다시 연결', () => {
  it('인터넷이 끊겼다 돌아왔는데 소켓이 닫힘 신호 없이 "연결됨"으로 남아 있으면, 새로 연결하고 놓친 것을 이어 받는다', () => {
    const t = setup();
    const onResync = jest.fn();
    t.client.subscribe(CHAT, { onMessage: jest.fn(), onResync });
    t.client.start();
    t.latest().connect();
    expect(onResync).toHaveBeenCalledTimes(1);
    // 비행기 모드: 소켓은 닫힘 신호를 보내지 않는다(반쯤 끊김)
    t.client.setOnline(false);
    t.client.setOnline(true);
    expect(t.instances).toHaveLength(2);
    expect(t.instances[0].deactivate).toHaveBeenCalled();
    t.latest().connect();
    expect(onResync).toHaveBeenCalledTimes(2);
    expect(t.state().kind).toBe('connected');
  });

  it('와이파이→LTE처럼 인터넷은 계속 있는데 네트워크가 바뀌면 새로 연결한다', () => {
    const t = setup();
    t.client.start();
    t.latest().connect();
    t.client.networkChanged();
    expect(t.instances).toHaveLength(2);
    expect(t.instances[0].deactivate).toHaveBeenCalled();
  });

  it('옛 소켓이 늦게 닫혀도 새 연결에는 영향이 없다', () => {
    const t = setup();
    t.client.start();
    t.latest().connect();
    t.client.networkChanged();
    t.latest().connect();
    t.instances[0].close();
    expect(t.state().kind).toBe('connected');
    expect(t.instances).toHaveLength(2);
  });

  it('연결 전이거나 로그아웃·백그라운드면 네트워크가 바뀌어도 아무것도 하지 않는다', () => {
    const t = setup();
    t.client.networkChanged();
    expect(t.instances).toHaveLength(0);
    t.client.start();
    t.latest().connect();
    t.client.pause();
    t.client.networkChanged();
    expect(t.instances).toHaveLength(1);
  });
});

describe('토큰 만료 전 미리 갱신', () => {
  const HOUR = 3_600_000;

  /** 토큰 만료 시각을 테스트가 정한다. 갱신하면 한 시간 뒤로 밀린다 */
  function setupWithExpiry(over: Partial<RealtimeDeps> = {}) {
    let expiresAt = Date.now() + HOUR;
    const refresh = jest.fn<() => Promise<string | null>>(async () => {
      expiresAt = Date.now() + HOUR;
      return 'token-2';
    });
    const t = setup({
      now: () => Date.now(),
      getTokenExpiresAt: () => expiresAt,
      refreshAccessToken: refresh,
      ...over,
    });
    return {
      ...t,
      refresh,
      setExpiresAt: (at: number) => {
        expiresAt = at;
      },
    };
  }

  it('만료 1분 전에 갱신하고, 새 연결이 붙을 때까지 옛 연결로 계속 받는다', async () => {
    const t = setupWithExpiry();
    const onMessage = jest.fn();
    const onResync = jest.fn();
    t.client.subscribe(CHAT, { onMessage, onResync });
    t.client.start();
    t.latest().connect();
    onResync.mockClear();

    await jest.advanceTimersByTimeAsync(HOUR - RENEW_AHEAD_MS - 1);
    expect(t.refresh).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(t.refresh).toHaveBeenCalledTimes(1);
    expect(t.instances).toHaveLength(2);

    // 새 연결은 아직 붙지 않았다. 옛 연결은 닫지 않았고 메시지도 그대로 받는다
    expect(t.instances[0].deactivate).not.toHaveBeenCalled();
    t.instances[0].deliver(CHAT, { n: 1 });
    expect(onMessage).toHaveBeenCalledWith({ n: 1 });

    t.latest().connect();
    expect(t.instances[0].deactivate).toHaveBeenCalledTimes(1);
    expect(t.latest().subscribed).toEqual([CHAT]);
    expect(onResync).toHaveBeenCalledTimes(1);
    t.latest().deliver(CHAT, { n: 2 });
    expect(onMessage).toHaveBeenCalledWith({ n: 2 });
    // 화면 안내에 쓰는 상태는 끊김을 거치지 않는다
    expect(t.state()).toEqual({ kind: 'connected' });
  });

  it('갈아탄 뒤 옛 연결이 늦게 닫히거나 오류를 보내도 무시한다', async () => {
    const t = setupWithExpiry();
    t.client.start();
    t.latest().connect();
    await jest.advanceTimersByTimeAsync(HOUR - RENEW_AHEAD_MS);
    t.latest().connect();
    t.instances[0].error('UNAUTHENTICATED');
    t.instances[0].close();
    await flush();
    expect(t.refresh).toHaveBeenCalledTimes(1);
    expect(t.instances).toHaveLength(2);
    expect(t.state()).toEqual({ kind: 'connected' });
  });

  it('갈아탄 연결도 다음 만료 전에 다시 미리 갱신한다', async () => {
    const t = setupWithExpiry();
    t.client.start();
    t.latest().connect();
    await jest.advanceTimersByTimeAsync(HOUR - RENEW_AHEAD_MS);
    t.latest().connect();
    await jest.advanceTimersByTimeAsync(HOUR - RENEW_AHEAD_MS);
    expect(t.refresh).toHaveBeenCalledTimes(2);
    expect(t.instances).toHaveLength(3);
  });

  it('미리 갱신에 실패하면 지금 연결을 그대로 둔다', async () => {
    const t = setupWithExpiry({ refreshAccessToken: async () => null });
    t.client.start();
    t.latest().connect();
    await jest.advanceTimersByTimeAsync(HOUR - RENEW_AHEAD_MS);
    expect(t.instances).toHaveLength(1);
    expect(t.instances[0].deactivate).not.toHaveBeenCalled();
    expect(t.state()).toEqual({ kind: 'connected' });
  });

  it('새 연결이 붙기 전에 실패하면 새 연결만 버리고 지금 연결로 계속 받는다', async () => {
    const t = setupWithExpiry();
    const onMessage = jest.fn();
    t.client.subscribe(CHAT, { onMessage });
    t.client.start();
    t.latest().connect();
    await jest.advanceTimersByTimeAsync(HOUR - RENEW_AHEAD_MS);
    t.latest().close();
    expect(t.instances[1].deactivate).toHaveBeenCalled();
    expect(t.instances[0].deactivate).not.toHaveBeenCalled();
    t.instances[0].deliver(CHAT, { n: 1 });
    expect(onMessage).toHaveBeenCalledWith({ n: 1 });
    expect(t.state()).toEqual({ kind: 'connected' });
    // 버린 연결이 늦게 붙어도 바꾸지 않는다
    t.instances[1].connect();
    expect(t.instances[0].deactivate).not.toHaveBeenCalled();
  });

  it('그 사이 REST 요청이 토큰을 이미 갱신했으면 다시 갱신하지 않고 연결만 새로 맺는다', async () => {
    const t = setupWithExpiry();
    t.client.start();
    t.latest().connect();
    await jest.advanceTimersByTimeAsync(HOUR / 2);
    t.setExpiresAt(Date.now() + HOUR);
    await jest.advanceTimersByTimeAsync(HOUR / 2 - RENEW_AHEAD_MS);
    expect(t.refresh).not.toHaveBeenCalled();
    expect(t.instances).toHaveLength(2);
  });

  it('미리 맺는 중에 지금 연결이 끊기면 새 연결을 버리고 원래 다시 연결 길로 간다', async () => {
    const t = setupWithExpiry();
    t.client.start();
    t.latest().connect();
    await jest.advanceTimersByTimeAsync(HOUR - RENEW_AHEAD_MS);
    t.instances[0].close();
    expect(t.state().kind).toBe('reconnecting');
    await jest.advanceTimersByTimeAsync(1000);
    expect(t.instances[1].deactivate).toHaveBeenCalled();
    expect(t.instances).toHaveLength(3);
    // 버린 연결이 늦게 붙어도 지금 연결을 건드리지 않는다
    t.instances[1].connect();
    expect(t.instances[2].deactivate).not.toHaveBeenCalled();
  });

  it('백그라운드로 가면 맞춰 둔 미리 갱신을 지운다', async () => {
    const t = setupWithExpiry();
    t.client.start();
    t.latest().connect();
    t.client.pause();
    await jest.advanceTimersByTimeAsync(HOUR);
    expect(t.refresh).not.toHaveBeenCalled();
    expect(t.instances).toHaveLength(1);
  });

  it('유효 시간이 미리 갱신 여유보다 짧은 토큰이어도 갱신이 잇달아 돌지 않는다', async () => {
    let expiresAt = Date.now() + 10_000;
    const refresh = jest.fn<() => Promise<string | null>>(async () => {
      expiresAt = Date.now() + 10_000;
      return 'token-2';
    });
    const t = setup({
      now: () => Date.now(),
      getTokenExpiresAt: () => expiresAt,
      refreshAccessToken: refresh,
    });
    t.client.start();
    t.latest().connect();
    await jest.advanceTimersByTimeAsync(0);
    t.latest().connect();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(t.instances).toHaveLength(2);
  });

  it('만료 시각을 모르면 미리 갱신하지 않는다', async () => {
    const t = setup({ now: () => Date.now(), getTokenExpiresAt: () => null });
    t.client.start();
    t.latest().connect();
    await jest.advanceTimersByTimeAsync(HOUR * 2);
    expect(t.refresh).not.toHaveBeenCalled();
    expect(t.instances).toHaveLength(1);
  });
});
