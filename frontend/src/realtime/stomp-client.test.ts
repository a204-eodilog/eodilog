import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { IStompSocket } from '@stomp/stompjs';

import type { StompCallbacks } from './realtime-client';
import { createStompClient, HEARTBEAT_MS } from './stomp-client';

/**
 * 반쯤 끊긴 연결(half-open) 재현.
 * 와이파이→LTE 전환이나 공유기가 연결을 몰래 끊으면, 앱 쪽 소켓은 열려 있는 것처럼 보이는데 서버에서 아무것도 오지 않는다.
 * 이때 close()를 불러도 상대가 답하지 않아 닫힘 신호(onclose)가 한참(OS의 TCP 시간 초과까지) 오지 않는다.
 * 아래 가짜 소켓은 처음 연결만 받아 주고 그 뒤로 아무것도 보내지 않으며, close()를 불러도 onclose를 부르지 않는다
 */
class HalfOpenSocket implements IStompSocket {
  url = 'ws://test/ws';
  binaryType: 'arraybuffer' | 'blob' = 'arraybuffer';
  readyState = 0;
  bufferedAmount = 0;
  onopen: ((ev?: unknown) => unknown) | null = null;
  onmessage: ((ev: { data: string | ArrayBuffer }) => unknown) | null = null;
  onclose: ((ev?: unknown) => unknown) | null = null;
  onerror: ((ev?: unknown) => unknown) | null = null;
  closeCalls = 0;

  constructor() {
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.({});
    }, 0);
  }

  send(data: string | ArrayBuffer | Uint8Array) {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    // CONNECT에만 답한다. 그 뒤로는 하트비트도 메시지도 보내지 않는다(반쯤 끊김)
    if (text.startsWith('CONNECT')) {
      setTimeout(() => {
        this.onmessage?.({
          data: `CONNECTED\nversion:1.2\nheart-beat:${HEARTBEAT_MS},${HEARTBEAT_MS}\n\n\0`,
        });
      }, 0);
    }
  }

  close() {
    // 상대가 답하지 않아 닫힘이 끝나지 않는다. onclose를 부르지 않는다
    this.closeCalls += 1;
    this.readyState = 2;
  }
}

function setup() {
  const socket = { current: null as HalfOpenSocket | null };
  const events: { at: number; what: string }[] = [];
  const start = Date.now();
  const callbacks: StompCallbacks = {
    connectHeaders: () => ({}),
    onConnect: () => events.push({ at: Date.now() - start, what: 'connected' }),
    onStompError: () => undefined,
    onWebSocketClose: () => events.push({ at: Date.now() - start, what: 'closed' }),
  };
  const client = createStompClient(callbacks, {
    brokerURL: 'ws://test/ws',
    webSocketFactory: () => {
      socket.current = new HalfOpenSocket();
      return socket.current;
    },
  });
  return { client, socket, events };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('반쯤 끊긴 연결', () => {
  it('서버에서 아무것도 오지 않으면 30초 안에 끊김을 알아채 다시 연결할 수 있게 한다(닫힘 신호를 기다리지 않음)', async () => {
    const { client, socket, events } = setup();
    client.activate();
    await jest.advanceTimersByTimeAsync(10);
    expect(events.map((e) => e.what)).toEqual(['connected']);

    // 120초 동안 1초씩 흘려 보며 끊김을 언제 알아채는지 본다
    let detectedAt: number | null = null;
    for (let s = 1; s <= 120 && detectedAt === null; s += 1) {
      await jest.advanceTimersByTimeAsync(1_000);
      const closed = events.find((e) => e.what === 'closed');
      if (closed) detectedAt = closed.at;
    }
    // 측정 기록용(트러블슈팅 문서)
    console.log(
      `[measure] half-open 감지 ${detectedAt === null ? '120초 안에 못 함' : `${detectedAt}ms`}, close() 호출 ${socket.current?.closeCalls}번`,
    );
    expect(detectedAt).not.toBeNull();
    // 검사는 10초마다 돌고 "20초 넘게 아무것도 안 옴"이면 끊는다. 최악이면 30초(+검사 시각 오차)
    expect(detectedAt!).toBeLessThanOrEqual(HEARTBEAT_MS * 3 + 1_000);
    expect(socket.current?.closeCalls).toBe(1);
    void client.deactivate();
  });
});
