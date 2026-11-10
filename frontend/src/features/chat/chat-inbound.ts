import type { QueryClient } from '@tanstack/react-query';

import { CATCH_UP_LIMIT, getMessages } from './api';
import { isBlocked } from './chat-rules';
import { updateLastMessage } from './hooks/chat-cache';
import { CHAT_ROOMS_KEY, chatMessagesKey } from './hooks/chat-keys';
import { settleOutbox } from './hooks/settle-outbox';
import {
  emptyWindow,
  holesAboveCursor,
  mergeMessages,
  nextCatchUpRequest,
  nextFillRequest,
  syncedUpTo,
} from './message-merge';
import type { Message, MessageWindow } from './types';

/**
 * 채팅 받기 담당(2026-11-06 동기화 엔진 구조로 정리).
 *
 * 일반 채팅앱처럼 메시지가 들어오는 입구를 receive() 하나로 모았다. 실시간·보내기 응답·처음 받기·이전 메시지·
 * 빈칸 채우기·이어 받기가 모두 같은 순서(모아 두기 → 합치기 → 내 말풍선 정리 → 목록 최근 메시지 → 빈칸 확인)를 거친다.
 * 예전에는 입구마다 이 일을 일부만 해서, 한 입구로 들어올 때만 메시지가 빠지거나 두 번 보였다(트러블슈팅 C5).
 *
 * "어디까지 받았나"는 커서(syncedUpTo: 빈틈없이 이어진 마지막 순번) 하나로 판단한다. 커서 위에 빈칸이 있으면 채운다.
 * 이어 받기·빈칸 채우기는 방마다 한 줄(받기 줄)에서 차례로 돈다. 요청 수는 개발 로그로 남긴다
 */

/** 무한히 돌지 않게 막는 상한. 100개씩 50번이면 5,000개다 */
const MAX_ROUNDS = 50;

export type ReceiveSource =
  'realtime' | 'send' | 'first-load' | 'older' | 'catch-up' | 'fill' | 'tail-check';

type Options = {
  /** 볼 수 없는 대화방이라는 응답. 차단 정리를 맡긴다 */
  onBlocked?: (tripId: string) => void;
  log?: (message: string) => void;
};

const devLog = (message: string) => {
  if (__DEV__) console.log(message);
};

/** 앱이 시작할 때 정하는 기본값(차단 정리). 빈칸 채우기처럼 receive가 스스로 시작하는 작업이 쓴다 */
let defaults: Options = {};

export function configureInbound(options: Options) {
  defaults = options;
}

// ── 열린 방 ─────────────────────────────────────────────

/** 지금 화면에 열린 대화방(tripId). 다시 연결되면 이 방만 바로 이어 받는다 */
const openTrips = new Set<string>();

export function markRoomOpen(tripId: string) {
  openTrips.add(tripId);
  return () => {
    openTrips.delete(tripId);
  };
}

export function isRoomOpen(tripId: string) {
  return openTrips.has(tripId);
}

function windowOf(queryClient: QueryClient, tripId: string) {
  return queryClient.getQueryData<MessageWindow>(chatMessagesKey(tripId));
}

// ── 입구 하나 ───────────────────────────────────────────

/**
 * 처음 받기를 기다리는 방(tripId)에 그사이 실시간으로 온 메시지.
 * 창이 아직 없어 넣을 곳이 없고, 첫 응답이 그 메시지보다 먼저 만들어졌으면 응답에도 없다. 그래서 따로 모아 첫 응답과 합친다(C1-1)
 */
const firstLoadBuffers = new Map<string, Message[]>();

/** 처음 받기를 시작한다. 이제부터 창이 생기기 전에 온 메시지는 모아 둔다 */
export function beginFirstLoad(tripId: string) {
  if (!firstLoadBuffers.has(tripId)) firstLoadBuffers.set(tripId, []);
}

/** 처음 받기가 끝났다(실패 포함). 모아 둔 것을 비운다 */
export function endFirstLoad(tripId: string) {
  firstLoadBuffers.delete(tripId);
}

/** 창을 새로 만들어도 되는 입구. 나머지는 창이 있을 때만 넣는다(열지 않은 방까지 메시지를 쌓지 않음) */
const CREATES_WINDOW: ReadonlySet<ReceiveSource> = new Set(['send', 'first-load']);
/** 빈칸을 스스로 확인할 입구. 이어 받기·빈칸 채우기는 자기 반복 안에서 채운다 */
const CHECKS_HOLES: ReadonlySet<ReceiveSource> = new Set([
  'realtime',
  'send',
  'first-load',
  'tail-check',
]);

/**
 * 메시지가 들어오는 단 하나의 입구. 들어온 길(source)과 상관없이 같은 순서로 처리한다.
 * 1. 창이 없고 처음 받기를 기다리는 중이면 모아 둔다
 * 2. 창에 합친다(id 중복 제거·같은 순번 덮어쓰기·정렬)
 * 3. 서버 메시지로 나타난 내 보내는 중 말풍선을 지운다
 * 4. 대화방 목록·방 정보의 최근 메시지를 바꾼다
 * 5. 커서 위에 빈칸이 있으면 채우기를 예약한다
 */
export function receive(
  queryClient: QueryClient,
  tripId: string,
  roomId: string,
  messages: readonly Message[],
  source: ReceiveSource,
  opts: { hasOlder?: boolean } = {},
) {
  const key = chatMessagesKey(tripId);
  const current = queryClient.getQueryData<MessageWindow>(key);

  if (!current && !CREATES_WINDOW.has(source)) {
    firstLoadBuffers.get(tripId)?.push(...messages);
  } else {
    let next = mergeMessages(current ?? emptyWindow(roomId), messages, opts);
    if (source === 'first-load') {
      next = mergeMessages(next, firstLoadBuffers.get(tripId) ?? []);
      endFirstLoad(tripId);
    }
    if (next !== current) queryClient.setQueryData<MessageWindow>(key, next);
  }

  settleOutbox(queryClient, roomId, messages);

  if (source !== 'older' && messages.length > 0) {
    const newest = messages.reduce((a, b) => (b.sequence > a.sequence ? b : a));
    updateLastMessage(queryClient, tripId, newest);
  }

  const after = windowOf(queryClient, tripId);
  if (after && CHECKS_HOLES.has(source) && holesAboveCursor(after)) {
    void requestHoleFill(queryClient, tripId);
  }
}

// ── 받기 줄 ─────────────────────────────────────────────

/** 방마다 받기 줄의 맨 끝 작업. 이어 받기·빈칸 채우기는 이 뒤에 선다 */
const tails = new Map<string, Promise<void>>();
/** 방마다 줄에 서서 아직 시작하지 않은 이어 받기. 같은 일을 두 번 세우지 않는다 */
const waitingCatchUps = new Map<string, Promise<void>>();

/**
 * 같은 방의 이어 받기·빈칸 채우기는 겹쳐 돌리지 않고 차례로 돌린다.
 * 돌고 있는 작업이 있다고 새 작업을 버리면, 그사이 생긴 다른 빈칸이 채워지지 않는다(C1-2).
 * 차례가 온 작업은 그때 창을 다시 보고 빈칸이 이미 채워졌으면 요청하지 않는다
 */
function enqueue(tripId: string, job: () => Promise<void>): Promise<void> {
  const prev = tails.get(tripId) ?? Promise.resolve();
  // 작업은 오류를 안에서 처리하지만, 혹시 앞 작업이 실패해도 뒤 작업은 돈다
  const next = prev.catch(() => undefined).then(job);
  tails.set(tripId, next);
  void next
    .catch(() => undefined)
    .finally(() => {
      if (tails.get(tripId) === next) tails.delete(tripId);
    });
  return next;
}

function handleError(queryClient: QueryClient, tripId: string, error: unknown, options: Options) {
  if (isBlocked(error)) {
    options.onBlocked?.(tripId);
    return;
  }
  // 다음에 열거나 다시 연결되면 또 이어 받는다
  queryClient.setQueryData<MessageWindow>(chatMessagesKey(tripId), (w) =>
    w ? { ...w, stale: true } : w,
  );
}

/**
 * 다시 연결·앱 복귀·방 열기 때 이어 받기. 처음 받기 전(창이 비어 있음)이면 할 일이 없다.
 * 최신 페이지를 받고, 커서(빈틈없이 받은 마지막 순번)까지 beforeSequence로 거슬러 받는다.
 * 아직 시작하지 않은 이어 받기가 줄에 있으면 그것을 같이 기다린다(같은 요청을 두 번 하지 않음)
 */
export function catchUp(queryClient: QueryClient, tripId: string, options: Options = defaults) {
  const waiting = waitingCatchUps.get(tripId);
  if (waiting) return waiting;
  const job = enqueue(tripId, async () => {
    if (waitingCatchUps.get(tripId) === job) waitingCatchUps.delete(tripId);
    const start = windowOf(queryClient, tripId);
    const known = start ? syncedUpTo(start) : null;
    if (!start || known === null) return;
    const log = options.log ?? devLog;
    let requests = 0;
    let lastAsked = '';
    try {
      const latest = await getMessages(start.roomId, { limit: CATCH_UP_LIMIT });
      requests += 1;
      receive(queryClient, tripId, start.roomId, latest.data, 'catch-up');
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const w = windowOf(queryClient, tripId);
        const req = w && nextCatchUpRequest(w, known);
        if (!req) break;
        const asked = `${req.beforeSequence}:${req.limit}`;
        if (asked === lastAsked) break;
        lastAsked = asked;
        const page = await getMessages(start.roomId, req);
        requests += 1;
        receive(queryClient, tripId, start.roomId, page.data, 'catch-up');
        // 받은 것으로 창이 하나도 바뀌지 않으면(서버에 그 순번이 없음) 같은 요청을 되풀이하지 않고 멈춘다
        if (windowOf(queryClient, tripId) === w) break;
      }
      queryClient.setQueryData<MessageWindow>(chatMessagesKey(tripId), (w) =>
        w ? { ...w, stale: false } : w,
      );
    } catch (error) {
      handleError(queryClient, tripId, error, options);
    } finally {
      log(`[chat] catch-up requests=${requests}`);
    }
  });
  waitingCatchUps.set(tripId, job);
  return job;
}

/**
 * 커서 위의 빈칸을 채운다. upTo를 주면 그 순번까지의 빈칸만 채운다(그 뒤에 새로 생긴 빈칸은 자기 대기를 마친 뒤 채운다).
 * 다른 작업이 돌고 있으면 그 뒤에 선다
 */
export function fillHoles(
  queryClient: QueryClient,
  tripId: string,
  options: Options = defaults,
  upTo?: number,
) {
  return enqueue(tripId, async () => {
    const start = windowOf(queryClient, tripId);
    if (!start) return;
    const log = options.log ?? devLog;
    let requests = 0;
    let lastAsked = '';
    try {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const w = windowOf(queryClient, tripId);
        const all = w && holesAboveCursor(w);
        const holes =
          all && upTo !== undefined
            ? { after: all.after, before: Math.min(all.before, upTo + 1) }
            : all;
        const req = w && holes && holes.before > holes.after + 1 && nextFillRequest(w, holes);
        if (!req) break;
        // 같은 요청이 다시 나오면 서버가 그 순번을 주지 않는 것이다. 되풀이하지 않는다
        const asked = `${req.beforeSequence}:${req.limit}`;
        if (asked === lastAsked) break;
        lastAsked = asked;
        const page = await getMessages(start.roomId, req);
        requests += 1;
        receive(queryClient, tripId, start.roomId, page.data, 'fill');
        // 받은 것으로 창이 하나도 바뀌지 않으면(서버에 그 순번이 없음) 같은 요청을 되풀이하지 않고 멈춘다
        if (windowOf(queryClient, tripId) === w) break;
      }
    } catch (error) {
      handleError(queryClient, tripId, error, options);
    } finally {
      log(`[chat] gap-fill requests=${requests}`);
    }
  });
}

/**
 * 빈칸을 봤을 때 채우기를 얼마나 기다렸다 시작할지(C5-C).
 * 여러 사람이 동시에 보내면 실시간 이벤트가 12 → 11처럼 뒤바뀌어 올 수 있다. 바로 요청하면 곧 올 11을 또 받는
 * 쓸데없는 요청이 된다. 잠깐 기다렸다 그때도 비어 있을 때만 요청한다. 테스트는 시간 축을 줄이려고 바꾼다
 */
export const gapFillTiming = { graceMs: 500 };

/**
 * 빈칸 채우기를 예약한다. 지금 보이는 빈칸(지금 가장 새 순번까지)만 대기 시간이 지난 뒤 채운다.
 * 그 뒤에 새로 생긴 빈칸은 그때 다시 예약돼 자기 대기 시간을 온전히 기다린다. 예전 예약에 실어 일찍 채우면
 * 곧 올 메시지를 또 받는 쓸데없는 요청이 된다(2026-11-06, 동기화 엔진으로 바꾸며 시뮬레이션으로 찾음).
 * 차례가 오면 그때 창을 다시 보고 여전히 비었을 때만 요청하므로, 같은 빈칸을 여러 번 예약해도 요청은 한 번이다
 */
export function requestHoleFill(
  queryClient: QueryClient,
  tripId: string,
  options: Options = defaults,
): Promise<void> {
  const upTo = windowOf(queryClient, tripId)?.newestSequence ?? undefined;
  const wait = gapFillTiming.graceMs;
  if (wait <= 0) return fillHoles(queryClient, tripId, options, upTo);
  return new Promise<void>((r) => setTimeout(r, wait)).then(() =>
    fillHoles(queryClient, tripId, options, upTo),
  );
}

// ── 마지막 메시지 확인 ──────────────────────────────────

/**
 * 마지막 메시지 유실 대비(2026-11-06).
 * 빈칸은 "다음 메시지"가 와야 보인다. 친구의 마지막 메시지 알림을 놓치고 그 뒤로 아무도 보내지 않으면 아무 신호가 없어
 * 방을 다시 열거나 다시 연결할 때까지 빠진 채로 남았다. 방이 열려 있고 앱이 앞에 있고 연결된 동안에만
 * 이 간격마다 서버의 최신 1개를 확인한다. 서버를 바꾸지 않고 풀 수 있는 방법이며, 대신 열린 방마다 간격당 요청 1번이 든다.
 * 서버가 주기적으로 최신 순번을 알려 주거나 받았다는 확인(ACK)을 주고받으면 이 확인은 없앨 수 있다(백엔드 합의 필요).
 * 알림에 "직전 순번"을 넣는 것으로는 막지 못한다(마지막 메시지 유실은 아무것도 도착하지 않는 상황이다)
 */
export const tailCheckTiming = { intervalMs: 15_000 };

/** 방마다 확인 요청이 아직 끝나지 않았으면 다음 확인을 건너뛴다(느린 네트워크에서 쌓이지 않게) */
const checkingLatest = new Set<string>();

/** 서버의 최신 1개를 보고, 화면보다 새 것이 있으면 입구로 넣는다(사이가 비면 빈칸 채우기로 이어진다) */
export function checkLatest(
  queryClient: QueryClient,
  tripId: string,
  roomId: string,
  options: Options = defaults,
): Promise<void> {
  if (checkingLatest.has(tripId)) return Promise.resolve();
  checkingLatest.add(tripId);
  return enqueue(tripId, async () => {
    try {
      const w = windowOf(queryClient, tripId);
      if (!w || w.newestSequence === null) return;
      const page = await getMessages(roomId, { limit: 1 });
      const latest = page.data[0];
      const newest = windowOf(queryClient, tripId)?.newestSequence ?? null;
      if (latest && (newest === null || latest.sequence > newest)) {
        receive(queryClient, tripId, roomId, page.data, 'tail-check');
        (options.log ?? devLog)(`[chat] tail-check found=${latest.sequence}`);
      }
    } catch (error) {
      handleError(queryClient, tripId, error, options);
    } finally {
      checkingLatest.delete(tripId);
    }
  });
}

/**
 * 방이 열려 있는 동안 간격마다 마지막 메시지를 확인한다. isActive가 false면(앱이 뒤·연결 끊김) 건너뛴다.
 * 끊긴 동안 놓친 것은 다시 연결할 때 이어 받기가 채운다. 돌려준 함수로 멈춘다
 */
export function watchLatest(
  queryClient: QueryClient,
  tripId: string,
  roomId: string,
  isActive: () => boolean,
): () => void {
  const timer = setInterval(() => {
    if (isActive()) void checkLatest(queryClient, tripId, roomId);
  }, tailCheckTiming.intervalMs);
  return () => clearInterval(timer);
}

/**
 * 구독이 끝날 때마다(처음 연결 포함) 부른다. 대화방 목록은 다시 받고, 열린 방은 바로 이어 받고,
 * 캐시에만 있는 방은 stale로 두어 다음에 열 때 이어 받는다(요청 0번)
 */
export function resyncChat(queryClient: QueryClient, options: Options = defaults) {
  void queryClient.invalidateQueries({ queryKey: CHAT_ROOMS_KEY });
  const windows = queryClient.getQueriesData<MessageWindow>({
    predicate: (q) => q.queryKey[0] === 'trips' && q.queryKey[2] === 'chat-messages',
  });
  for (const [key, w] of windows) {
    if (!w) continue;
    const tripId = String(key[1]);
    if (isRoomOpen(tripId)) void catchUp(queryClient, tripId, options);
    else queryClient.setQueryData<MessageWindow>(key, { ...w, stale: true });
  }
}
