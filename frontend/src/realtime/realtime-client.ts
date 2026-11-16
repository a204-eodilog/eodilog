import { reconnectDelay, type ConnectionEvent, type ConnectionState } from './connection-machine';
import { isAllowedDestination } from './destinations';

/**
 * 앱 전체에서 하나만 여는 실시간 연결(research R1~R5, contracts/realtime.md).
 * 받기만 한다(SEND 없음). 기능은 subscribe로 목적지를 등록하고, 끊겼다 이어지면 onResync로 빠진 것을 REST로 채운다.
 *
 * 경계: 이 폴더는 src/stores·src/api·src/config만 불러온다. features/*는 불러오지 않는다.
 * 연결마다 STOMP 클라이언트를 새로 만든다. 라이브러리의 자동 다시 연결은 끄고(reconnectDelay 0)
 * 다시 시도 간격·토큰 갱신·앱 앞뒤 전환을 여기서 한곳에 다룬다
 *
 * 토큰 만료: 서버는 연결에 쓴 access 토큰의 만료 시각에 연결을 끊는다. 끊긴 뒤 갱신하면 그동안 실시간이 멈추므로,
 * 만료 시각을 알면 그 전에 미리 갱신하고 새 연결을 먼저 맺은 뒤 옛 연결을 닫는다(renewAhead).
 * 미리 갱신에 실패하면 아무것도 바꾸지 않는다. 서버가 끊은 뒤 갱신하는 원래 길(handleStompError)이 그대로 받는다
 */

/** 만료 이만큼 전에 미리 갱신한다. 갱신 요청과 새 연결이 만료 전에 끝날 만큼 넉넉히 둔다 */
export const RENEW_AHEAD_MS = 60_000;

export type RealtimeHandlers = {
  /** 받은 본문(JSON을 푼 값). 모양 확인은 기능이 한다 */
  onMessage(body: unknown): void;
  /** 구독이 끝날 때마다(처음 연결 포함) 불린다. 빠진 것을 REST로 채운다 */
  onResync?(): void;
};

/** STOMP 클라이언트에서 쓰는 부분만. 테스트에서는 가짜를 넣는다 */
export type StompLike = {
  activate(): void;
  deactivate(): unknown;
  subscribe(
    destination: string,
    callback: (message: { body: string }) => void,
  ): {
    unsubscribe(): void;
  };
};

export type StompCallbacks = {
  /** 연결 직전. 연결 헤더를 돌려준다 */
  connectHeaders(): Record<string, string>;
  onConnect(): void;
  /** ERROR 프레임. message 헤더가 오류 코드다 */
  onStompError(code: string | undefined): void;
  onWebSocketClose(): void;
};

export type RealtimeDeps = {
  createStomp(callbacks: StompCallbacks): StompLike;
  getAccessToken(): string | null;
  /** src/api/session.ts의 refreshAccessToken. 동시에 불려도 갱신은 한 번이다 */
  refreshAccessToken(): Promise<string | null>;
  /** 지금 access 토큰의 만료 시각(ms). 모르면 null이고, 그때는 미리 갱신하지 않는다 */
  getTokenExpiresAt?(): number | null;
  connection: { get(): ConnectionState; dispatch(event: ConnectionEvent): void };
  now?: () => number;
  log?: (message: string) => void;
};

type Intent = 'idle' | 'running' | 'paused' | 'halted';

/** 미리 맺는 새 연결. 버려졌으면 cancelled */
type Handover = { stomp: StompLike | null; cancelled: boolean };

export function createRealtimeClient(deps: RealtimeDeps) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => undefined);

  const handlers = new Map<string, Set<RealtimeHandlers>>();
  let stomp: StompLike | null = null;
  let connected = false;
  const stompSubs = new Map<string, { unsubscribe(): void }>();
  /** 지난 연결의 늦은 콜백을 버리려고 연결마다 늘린다 */
  let generation = 0;
  let intent: Intent = 'idle';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let online = true;
  /** 토큰을 갱신한 뒤 아직 연결에 성공하지 못했다. 이때 또 UNAUTHENTICATED면 멈춘다(research R3) */
  let refreshedSinceConnect = false;
  let refreshing = false;
  /** 만료 전에 미리 갱신하려고 맞춰 둔 타이머 */
  let renewTimer: ReturnType<typeof setTimeout> | null = null;
  /** 마지막으로 미리 갱신을 시작한 시각. 유효 시간이 아주 짧은 토큰에서 갱신이 잇달아 돌지 않게 한다 */
  let lastRenewAt: number | null = null;
  /** 미리 맺는 중인 새 연결. 연결되면 지금 연결과 바꾼다 */
  let handover: Handover | null = null;

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function cancelHandover() {
    const h = handover;
    handover = null;
    if (!h) return;
    h.cancelled = true;
    try {
      h.stomp?.deactivate();
    } catch {
      // 이미 닫힌 연결이면 할 일이 없다
    }
  }

  function clearRenew() {
    if (renewTimer) clearTimeout(renewTimer);
    renewTimer = null;
  }

  function teardown() {
    generation += 1;
    connected = false;
    clearRenew();
    cancelHandover();
    stompSubs.clear();
    const old = stomp;
    stomp = null;
    if (old) {
      try {
        old.deactivate();
      } catch {
        // 이미 닫힌 연결이면 할 일이 없다
      }
    }
  }

  function deliver(destination: string, raw: string) {
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      log(`[realtime] JSON이 아닌 본문을 버림 ${destination}`);
      return;
    }
    for (const h of handlers.get(destination) ?? []) {
      try {
        h.onMessage(body);
      } catch (e) {
        log(`[realtime] 처리 중 오류 ${destination}: ${String(e)}`);
      }
    }
  }

  function subscribeStomp(destination: string) {
    if (!stomp || !connected || stompSubs.has(destination)) return;
    stompSubs.set(
      destination,
      stomp.subscribe(destination, (m) => deliver(destination, m.body)),
    );
  }

  function resync(targets: Iterable<RealtimeHandlers>) {
    for (const h of targets) {
      try {
        h.onResync?.();
      } catch (e) {
        log(`[realtime] onResync 오류: ${String(e)}`);
      }
    }
  }

  function handleConnect() {
    connected = true;
    refreshedSinceConnect = false;
    deps.connection.dispatch({ type: 'connected' });
    // 구독을 먼저 한 뒤 REST로 이어 받는다(API 명세 재접속 복구 순서). 처음 연결도 같다(research R5)
    for (const destination of handlers.keys()) subscribeStomp(destination);
    resync([...handlers.values()].flatMap((set) => [...set]));
    scheduleRenew();
  }

  /** 지금 연결에 쓴 토큰이 만료되기 전에 미리 갱신하도록 타이머를 맞춘다 */
  function scheduleRenew() {
    clearRenew();
    const expiresAt = deps.getTokenExpiresAt?.() ?? null;
    if (expiresAt === null) return;
    const wait = Math.max(expiresAt - now() - RENEW_AHEAD_MS, 0);
    // 방금 미리 갱신했는데 또 곧 만료라면 유효 시간이 미리 갱신 여유보다 짧은 토큰이다. 되풀이하지 않는다
    if (lastRenewAt !== null && now() + wait - lastRenewAt < RENEW_AHEAD_MS) return;
    renewTimer = setTimeout(() => void renewAhead(expiresAt), wait);
  }

  /**
   * 만료 전에 미리 갱신하고 새 연결로 갈아탄다. 지금 연결은 새 연결이 구독을 마칠 때까지 그대로 받는다.
   * 그 사이 REST 요청이 이미 토큰을 갱신했으면 다시 갱신하지 않고 그 토큰으로 연결만 새로 맺는다
   */
  async function renewAhead(scheduledFor: number) {
    renewTimer = null;
    if (intent !== 'running' || !connected) return;
    lastRenewAt = now();
    const myGeneration = generation;
    const alreadyRenewed = (deps.getTokenExpiresAt?.() ?? 0) > scheduledFor;
    if (!alreadyRenewed) {
      const token = await deps.refreshAccessToken().catch(() => null);
      // 갱신에 실패했거나 그 사이 연결이 바뀌었다. 원래 길에 맡긴다
      if (!token || intent !== 'running' || !connected || myGeneration !== generation) return;
    }
    startHandover();
  }

  function startHandover() {
    if (handover) return;
    const h: Handover = { stomp: null, cancelled: false };
    handover = h;
    /** 갈아탄 뒤 이 연결의 세대. 그 전에는 null */
    let myGeneration: number | null = null;
    const live = () => myGeneration !== null && myGeneration === generation;
    const abandon = () => {
      if (handover === h) cancelHandover();
    };
    const next = deps.createStomp({
      connectHeaders: (): Record<string, string> => {
        const token = deps.getAccessToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
      onConnect: () => {
        if (h.cancelled || handover !== h || intent !== 'running') return;
        // 새 연결이 붙었다. 옛 연결의 늦은 콜백을 버리고 새 연결로 바꾼다
        const old = stomp;
        generation += 1;
        myGeneration = generation;
        handover = null;
        stomp = next;
        stompSubs.clear();
        connected = true;
        refreshedSinceConnect = false;
        for (const destination of handlers.keys()) subscribeStomp(destination);
        try {
          old?.deactivate();
        } catch {
          // 이미 닫힌 연결이면 할 일이 없다
        }
        // 두 연결이 겹친 동안 같은 메시지가 두 번 왔을 수 있다. 기능이 걸러 내고, 혹시 빠진 것은 여기서 채운다
        resync([...handlers.values()].flatMap((set) => [...set]));
        scheduleRenew();
      },
      // 갈아타기 전에 실패하면 새 연결만 버린다. 지금 연결은 그대로다
      onStompError: (code) => {
        if (live()) void handleStompError(code);
        else abandon();
      },
      onWebSocketClose: () => {
        if (live()) handleClose();
        else abandon();
      },
    });
    h.stomp = next;
    next.activate();
  }

  function stopWith(reason: 'auth' | 'profile' | 'forbidden') {
    clearTimer();
    teardown();
    intent = 'halted';
    deps.connection.dispatch({ type: 'authFailed', reason });
  }

  async function handleStompError(code: string | undefined) {
    log(`[realtime] ERROR ${code ?? '(코드 없음)'}`);
    if (code === 'PROFILE_INCOMPLETE') return stopWith('profile');
    if (code === 'FORBIDDEN') return stopWith('forbidden');
    if (code !== 'UNAUTHENTICATED') return; // 연결이 닫히면 끊김으로 다시 시도한다
    if (refreshedSinceConnect) return stopWith('auth');
    refreshedSinceConnect = true;
    refreshing = true;
    const myGeneration = generation;
    const token = await deps.refreshAccessToken().catch(() => null);
    refreshing = false;
    if (intent !== 'running' || myGeneration !== generation) return;
    if (!token) return stopWith('auth');
    connectNow();
  }

  function scheduleReconnect() {
    clearTimer();
    if (!online) return; // 네트워크가 돌아오면 setOnline(true)가 바로 시도한다
    const state = deps.connection.get();
    const attempt = state.kind === 'reconnecting' ? state.attempt : 1;
    timer = setTimeout(connectNow, reconnectDelay(attempt));
  }

  function handleClose() {
    connected = false;
    stompSubs.clear();
    if (intent !== 'running' || refreshing) return;
    deps.connection.dispatch({ type: 'dropped', at: now() });
    scheduleReconnect();
  }

  /**
   * 지금 연결을 버리고 새로 연결한다(2026-11-06, 반쯤 끊긴 연결 대비).
   * 네트워크가 바뀌면 옛 소켓은 닫힘 신호 없이 "연결됨"으로 남아 아무것도 받지 못할 수 있다. 하트비트로 알아채기까지
   * 최대 30초를 기다리지 않고 바로 새로 붙는다. 세대 번호가 바뀌므로 옛 소켓이 늦게 닫혀도 무시된다.
   * 새 연결이 구독을 마치면 onResync로 놓친 메시지를 이어 받는다
   */
  function reconnectFresh() {
    if (intent !== 'running') return;
    const wasConnected = connected;
    teardown();
    if (wasConnected) deps.connection.dispatch({ type: 'dropped', at: now() });
    connectNow();
  }

  function connectNow() {
    clearTimer();
    teardown();
    if (intent !== 'running') return;
    const myGeneration = generation;
    const current = () => myGeneration === generation;
    stomp = deps.createStomp({
      connectHeaders: (): Record<string, string> => {
        const token = deps.getAccessToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
      onConnect: () => current() && handleConnect(),
      onStompError: (code) => {
        if (current()) void handleStompError(code);
      },
      onWebSocketClose: () => current() && handleClose(),
    });
    stomp.activate();
  }

  return {
    /** 로그인 상태이고 앱이 앞에 있을 때 */
    start() {
      if (intent === 'running') return;
      intent = 'running';
      refreshedSinceConnect = false;
      deps.connection.dispatch({ type: 'start' });
      connectNow();
    },
    /** 로그아웃. 다시 연결하지 않는다 */
    stop() {
      intent = 'idle';
      clearTimer();
      teardown();
      deps.connection.dispatch({ type: 'signOut' });
    },
    /** 앱이 백그라운드로 갔다. 푸시가 없으니 연결을 끊는다 */
    pause() {
      if (intent === 'idle') return;
      intent = 'paused';
      clearTimer();
      teardown();
      deps.connection.dispatch({ type: 'background' });
    },
    /** 앱이 앞으로 왔다. 다시 연결한 뒤 onResync가 불린다 */
    resume() {
      if (intent !== 'paused' && intent !== 'halted') return;
      intent = 'running';
      refreshedSinceConnect = false;
      deps.connection.dispatch({ type: 'foreground' });
      connectNow();
    },
    /** 네트워크 상태. 돌아오면 기다리지 않고 바로 다시 시도한다 */
    setOnline(next: boolean) {
      const wasOffline = !online;
      online = next;
      if (!next) {
        clearTimer();
        return;
      }
      deps.connection.dispatch({ type: 'online' });
      // 끊겼다 돌아왔다. 상태가 "연결됨"이어도 그 소켓은 이미 죽었을 수 있어(닫힘 신호가 안 옴) 새로 붙는다
      if (wasOffline) reconnectFresh();
    },
    /** 와이파이→LTE처럼 인터넷은 있는데 네트워크가 바뀌었다. 옛 소켓을 버리고 새로 붙는다 */
    networkChanged() {
      if (online) reconnectFresh();
    },
    /** 다시 연결을 기다리는 중이면 간격을 건너뛰고 바로 시도한다 */
    retryNow() {
      if (intent === 'running' && deps.connection.get().kind === 'reconnecting') connectNow();
    },
    /**
     * 목적지를 구독한다. 같은 목적지는 STOMP 구독을 하나만 하고 처리 함수를 여러 개 붙인다.
     * 허용 목록(destinations.ts)에 없으면 개발 빌드에서는 오류, 실제 빌드에서는 무시한다.
     * 돌려준 함수를 부르면 등록을 푼다. 마지막 처리 함수가 풀리면 구독도 푼다
     */
    subscribe(destination: string, h: RealtimeHandlers): () => void {
      if (!isAllowedDestination(destination)) {
        const message = `[realtime] 허용되지 않은 목적지 ${destination}. destinations.ts에 서버와 함께 더한다`;
        if (__DEV__) throw new Error(message);
        log(message);
        return () => undefined;
      }
      let set = handlers.get(destination);
      if (!set) {
        set = new Set();
        handlers.set(destination, set);
      }
      set.add(h);
      if (connected) {
        subscribeStomp(destination);
        // 연결된 뒤 붙은 기능도 그 사이 놓친 것이 있을 수 있다
        resync([h]);
      }
      return () => {
        const current = handlers.get(destination);
        if (!current) return;
        current.delete(h);
        if (current.size === 0) {
          handlers.delete(destination);
          stompSubs.get(destination)?.unsubscribe();
          stompSubs.delete(destination);
        }
      };
    },
  };
}

export type RealtimeClient = ReturnType<typeof createRealtimeClient>;
