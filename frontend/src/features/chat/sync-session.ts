import type { QueryClient } from '@tanstack/react-query';

import type { Message } from './types';

/**
 * 채팅 동기화 엔진의 상태를 로그인 한 번 동안의 세션 하나에 모은다(2026-11-09 엔진 하나로 묶기).
 *
 * 예전에는 받기(chat-inbound.ts)와 보내기(use-send-message.ts)의 작업 줄·대기 작업·타이머가 파일마다 따로 흩어진
 * 모듈 변수였다. 로그아웃 정리는 그중 일부만 지웠고, 서버 요청은 끊을 방법이 없었다. 그래서 응답을 기다리던 보내기가
 * 로그아웃 뒤에 도착하면 방금 비운 캐시에 이전 사용자의 대화 창을 다시 만들었다(chat-sync-stop.test.ts).
 *
 * 이제 모든 작업은 시작할 때 지금 세션을 잡고, 서버 요청에 세션의 취소 신호를 넘기고, 응답을 받은 뒤 세션이 멈췄으면
 * 아무것도 바꾸지 않는다. 로그아웃하면 stopChatSync가 세션을 멈추고(요청 취소·타이머 해제) 빈 세션으로 바꾼다
 */

/** 다시 보낼 때 필요한 것. 화면에서 보낸 적이 있으면 그때 것을 쓴다 */
export type SendContext = { queryClient: QueryClient; tripId: string; onBlocked?: () => void };

export type InboundOptions = {
  /** 볼 수 없는 대화방이라는 응답. 차단 정리를 맡긴다 */
  onBlocked?: (tripId: string) => void;
  log?: (message: string) => void;
};

export type ChatSyncSession = {
  /** 로그아웃으로 멈췄다. 기다리던 작업은 응답이 와도 아무것도 바꾸지 않는다 */
  readonly stopped: boolean;
  /** 이 세션의 모든 서버 요청에 넘긴다. 멈추면 기다리던 요청이 끊긴다 */
  readonly signal: AbortSignal;

  // ── 받기(chat-inbound.ts) ──
  /** 앱 층이 정하는 기본값(차단 정리·로그). 받기가 스스로 시작하는 작업이 쓴다 */
  inbound: InboundOptions;
  /** 지금 화면에 열린 대화방(tripId) */
  readonly openTrips: Set<string>;
  /** 처음 받기를 기다리는 방에 그사이 실시간으로 온 메시지 */
  readonly firstLoadBuffers: Map<string, Message[]>;
  /** 방마다 받기 줄(이어 받기·빈칸 채우기·마지막 메시지 확인)의 맨 끝 작업 */
  readonly receiveTails: Map<string, Promise<void>>;
  /** 방마다 줄에 서서 아직 시작하지 않은 이어 받기 */
  readonly waitingCatchUps: Map<string, Promise<void>>;
  /** 방마다 마지막 메시지 확인이 진행 중인지 */
  readonly checkingLatest: Set<string>;

  // ── 보내기(use-send-message.ts) ──
  /** 앱 층이 넘겨주는 queryClient와 차단 정리. 앱을 막 켜 화면이 없어도 저장된 메시지를 보낼 때 쓴다 */
  send: { queryClient: QueryClient | null; onBlocked?: (tripId: string) => void };
  /** 방마다 보내기 줄의 맨 끝 작업. 한 방에서는 한 번에 하나씩 보낸다 */
  readonly sendTails: Map<string, Promise<void>>;
  readonly sendContexts: Map<string, SendContext>;
  /** 방마다 연결 신호 없이 다시 보낼 타이머 */
  readonly resendTimers: Map<
    string,
    { attempt: number; timer: ReturnType<typeof setTimeout> | null }
  >;

  /** 멈출 때 함께 멈출 타이머 등(빈칸 채우기 대기·마지막 메시지 확인 주기) */
  readonly cancels: Set<() => void>;
};

type MutableSession = ChatSyncSession & { stopped: boolean; controller: AbortController };

function createSession(): MutableSession {
  const controller = new AbortController();
  return {
    stopped: false,
    controller,
    signal: controller.signal,
    inbound: {},
    openTrips: new Set(),
    firstLoadBuffers: new Map(),
    receiveTails: new Map(),
    waitingCatchUps: new Map(),
    checkingLatest: new Set(),
    send: { queryClient: null },
    sendTails: new Map(),
    sendContexts: new Map(),
    resendTimers: new Map(),
    cancels: new Set(),
  };
}

let current = createSession();

/** 지금 세션. 비동기 작업은 시작할 때 한 번 잡아 두고, 기다린 뒤에는 그 세션이 멈췄는지 본다 */
export function chatSync(): ChatSyncSession {
  return current;
}

/**
 * 로그아웃. 지금 세션을 멈추고 빈 세션으로 바꾼다.
 * 기다리던 서버 요청을 끊고, 타이머를 풀고, 줄·대기 작업·설정을 모두 버린다. 여러 번 불러도 된다
 */
export function stopChatSync() {
  const s = current;
  current = createSession();
  s.stopped = true;
  s.controller.abort();
  for (const cancel of s.cancels) cancel();
  for (const t of s.resendTimers.values()) if (t.timer) clearTimeout(t.timer);
}

/**
 * 같은 키의 작업을 겹쳐 돌리지 않고 차례로 돌린다. 앞 작업이 실패해도 뒤 작업은 돈다.
 * 줄이 비면 키를 지운다(방 수만큼 쌓이지 않음). 받기 줄과 보내기 줄이 같이 쓴다
 */
export function enqueueOn(
  tails: Map<string, Promise<void>>,
  key: string,
  job: () => Promise<void>,
): Promise<void> {
  const prev = tails.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(job);
  tails.set(key, next);
  void next
    .catch(() => undefined)
    .finally(() => {
      if (tails.get(key) === next) tails.delete(key);
    });
  return next;
}

/** 둘 중 하나라도 취소되면 취소되는 신호(쿼리 취소 + 로그아웃). AbortSignal.any가 없는 엔진도 있어 직접 만든다 */
export function eitherSignal(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
  if (!a) return b;
  if (a.aborted || b.aborted) return a.aborted ? a : b;
  const controller = new AbortController();
  const abort = () => controller.abort();
  a.addEventListener('abort', abort, { once: true });
  b.addEventListener('abort', abort, { once: true });
  return controller.signal;
}
