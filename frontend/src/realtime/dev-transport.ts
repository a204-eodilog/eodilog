import type { StompCallbacks, StompLike } from './realtime-client';

/**
 * 개발용 테스트 모드(env.devMock)의 메모리 전달. 소켓을 열지 않고 가짜 서버(src/api/dev-mock.ts)가
 * 저장한 메시지를 같은 이벤트 모양으로 구독자에게 바로 보낸다. 끊김·복구도 흉내 낸다
 */

type DevSocket = StompLike & {
  deliver(destination: string, body: string): void;
  close(): void;
};

const sockets = new Set<DevSocket>();
let dropped = false;
let onRestore: (() => void) | null = null;

const CONNECT_DELAY_MS = 50;

export function createDevStomp(callbacks: StompCallbacks): StompLike {
  const subs = new Map<string, (message: { body: string }) => void>();
  let open = false;
  const socket: DevSocket = {
    activate() {
      setTimeout(() => {
        if (dropped) {
          callbacks.onWebSocketClose();
          return;
        }
        open = true;
        sockets.add(socket);
        callbacks.connectHeaders();
        callbacks.onConnect();
      }, CONNECT_DELAY_MS);
    },
    deactivate() {
      open = false;
      sockets.delete(socket);
    },
    subscribe(destination, callback) {
      subs.set(destination, callback);
      return { unsubscribe: () => subs.delete(destination) };
    },
    deliver(destination, body) {
      if (open) subs.get(destination)?.({ body });
    },
    close() {
      if (!open) return;
      open = false;
      sockets.delete(socket);
      callbacks.onWebSocketClose();
    },
  };
  return socket;
}

export const devRealtime = {
  /** 가짜 서버가 이벤트를 보낸다. 끊겨 있으면 받는 쪽이 없다(실서버처럼 사라진다) */
  publish(destination: string, body: unknown) {
    const raw = JSON.stringify(body);
    for (const socket of sockets) socket.deliver(destination, raw);
  },
  /** 끊김 흉내. 다시 연결 시도도 실패한다 */
  drop() {
    dropped = true;
    for (const socket of [...sockets]) socket.close();
  },
  /** 다시 연결 흉내. 실시간 모듈이 바로 다시 시도하게 알린다 */
  restore() {
    dropped = false;
    onRestore?.();
  },
  /** 확인용: 열린 메모리 연결 수와 끊김 흉내 여부 */
  debug() {
    return { sockets: sockets.size, dropped };
  },
  setRestoreHandler(handler: (() => void) | null) {
    onRestore = handler;
  },
};
