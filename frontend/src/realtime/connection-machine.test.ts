import { describe, expect, it } from '@jest/globals';

import {
  IDLE,
  nextConnection,
  reconnectDelay,
  showDisconnected,
  type ConnectionEvent,
  type ConnectionState,
} from './connection-machine';

const run = (state: ConnectionState, ...events: ConnectionEvent[]) =>
  events.reduce(nextConnection, state);

describe('연결 상태 전이', () => {
  it('연결 → 끊김 → 다시 끊김이면 시도 횟수가 늘고 처음 끊긴 시각은 그대로다', () => {
    const connected = run(IDLE, { type: 'start' }, { type: 'connected' });
    expect(connected).toEqual({ kind: 'connected' });
    const once = run(connected, { type: 'dropped', at: 1000 });
    expect(once).toEqual({ kind: 'reconnecting', attempt: 1, since: 1000 });
    expect(run(once, { type: 'dropped', at: 5000 })).toEqual({
      kind: 'reconnecting',
      attempt: 2,
      since: 1000,
    });
  });

  it('다시 연결되면 시도 횟수가 지워진다', () => {
    const s = run(IDLE, { type: 'start' }, { type: 'dropped', at: 0 }, { type: 'connected' });
    expect(s).toEqual({ kind: 'connected' });
  });

  it('백그라운드면 paused, 앞으로 오면 connecting', () => {
    const paused = run({ kind: 'connected' }, { type: 'background' });
    expect(paused).toEqual({ kind: 'paused' });
    expect(run(paused, { type: 'foreground' })).toEqual({ kind: 'connecting' });
  });

  it('인증 실패면 stopped이고 앞으로 오면 다시 connecting', () => {
    const stopped = run({ kind: 'connecting' }, { type: 'authFailed', reason: 'auth' });
    expect(stopped).toEqual({ kind: 'stopped', reason: 'auth' });
    expect(run(stopped, { type: 'foreground' })).toEqual({ kind: 'connecting' });
  });

  it('로그아웃이면 어디서든 idle', () => {
    const states: ConnectionState[] = [
      { kind: 'connected' },
      { kind: 'paused' },
      { kind: 'reconnecting', attempt: 3, since: 0 },
      { kind: 'stopped', reason: 'profile' },
    ];
    for (const s of states) expect(run(s, { type: 'signOut' })).toEqual(IDLE);
  });

  it('로그아웃 상태에서는 연결·끊김·백그라운드를 무시한다', () => {
    expect(
      run(IDLE, { type: 'connected' }, { type: 'dropped', at: 0 }, { type: 'background' }),
    ).toBe(IDLE);
  });

  it('백그라운드에서 들어온 늦은 연결 완료는 무시한다', () => {
    expect(run({ kind: 'paused' }, { type: 'connected' })).toEqual({ kind: 'paused' });
  });
});

describe('끊김 안내', () => {
  const dropped: ConnectionState = { kind: 'reconnecting', attempt: 1, since: 10_000 };

  it('끊긴 지 3초가 안 됐으면 없고, 3초가 되면 있다', () => {
    expect(showDisconnected(dropped, 12_999)).toBe(false);
    expect(showDisconnected(dropped, 13_000)).toBe(true);
  });

  it('백그라운드·연결 중·로그아웃이면 없다', () => {
    expect(showDisconnected({ kind: 'paused' }, 99_999)).toBe(false);
    expect(showDisconnected({ kind: 'connecting' }, 99_999)).toBe(false);
    expect(showDisconnected(IDLE, 99_999)).toBe(false);
  });

  it('인증 실패로 멈췄으면 바로 있다', () => {
    expect(showDisconnected({ kind: 'stopped', reason: 'auth' }, 0)).toBe(true);
  });
});

describe('다시 시도 간격', () => {
  it('1·2·4·8·16·30·30초', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(reconnectDelay)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
  });
});
