import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { sendMessage } from '../api';
import { receive } from '../chat-inbound';
import { cleanMessageText, sendFailure } from '../chat-rules';
import { tripIdOf } from '../room-index';
import { chatSync, enqueueOn, type SendContext } from '../sync-session';

import { useChatOutbox } from './use-chat-outbox';

/**
 * 방마다 한 번에 하나씩 차례로 보낸다. 동시에 보내면 서버 도착 순서가 바뀔 수 있다(research R8).
 * 거절된 항목은 큐에서 빠지고 뒤 항목은 계속 보낸다. 연결 문제로 기다리는 항목이 있으면 뒤 항목도 기다린다.
 * 줄은 로그인 세션(sync-session.ts)에 있어 로그아웃하면 함께 버려진다
 */
function enqueue(roomId: string, job: () => Promise<void>) {
  const s = chatSync();
  return enqueueOn(s.sendTails, roomId, () => (s.stopped ? Promise.resolve() : job()));
}

type Options = {
  /** 볼 수 없는 대화방이라는 응답(404). 차단 정리는 화면 쪽에서 한다 */
  onBlocked?: () => void;
};

/**
 * 연결 문제로 못 보낸 메시지를 자동으로 다시 보내는 규칙(2026-11-06 추가).
 * 카카오톡처럼 연결이 돌아오면 같은 clientMessageId로 다시 보낸다. 서버는 같은 번호표면 저장해 둔 메시지를
 * 돌려주므로(멱등) 몇 번을 다시 보내도 한 번만 저장된다. 테스트는 시간 축을 줄이려고 바꾼다
 */
export const autoResend = {
  /** 이 시간 안에는 실패를 띄우지 않고 기다렸다 다시 보낸다. 넘으면 [다시 보내기]. 0이면 자동 재전송을 하지 않는다 */
  windowMs: 2 * 60_000,
  /** 연결이 돌아왔다는 신호가 없어도 다시 시도하는 간격(서버만 잠깐 안 될 때) */
  delaysMs: [2_000, 4_000, 8_000, 16_000, 30_000],
  now: () => Date.now(),
};

/**
 * 앱 층(startChatRealtime)이 넘겨주는 queryClient와 차단 정리.
 * 앱을 다시 켜면 화면이 아직 없어도 기기에 저장돼 있던 메시지를 보낼 수 있어야 해서 둔다
 */
export function attachSendEngine(
  queryClient: QueryClient | null,
  onBlocked?: (tripId: string) => void,
) {
  chatSync().send = { queryClient, onBlocked };
}

/** 다시 보낼 때 필요한 것. 화면에서 보낸 적이 있으면 그때 것을, 없으면(앱을 막 켬) 엔진과 방 표에서 찾는다 */
function contextOf(roomId: string): SendContext | null {
  const s = chatSync();
  const seen = s.sendContexts.get(roomId);
  if (seen) return seen;
  const tripId = tripIdOf(roomId);
  const { queryClient, onBlocked } = s.send;
  if (!queryClient || !tripId) return null;
  return {
    queryClient,
    tripId,
    onBlocked: onBlocked && (() => onBlocked(tripId)),
  };
}

/** 연결 신호가 없을 때를 위한 다음 시도. 이미 잡혀 있으면 그대로 둔다 */
function scheduleResend(roomId: string) {
  const { resendTimers: timers } = chatSync();
  const t = timers.get(roomId) ?? { attempt: 0, timer: null };
  timers.set(roomId, t);
  if (t.timer) return;
  const delays = autoResend.delaysMs;
  const delay = delays[Math.min(t.attempt, delays.length - 1)];
  t.attempt += 1;
  t.timer = setTimeout(() => {
    t.timer = null;
    void resendRoom(roomId);
  }, delay);
}

/** 기다리는 메시지를 쓴 순서대로 다시 줄 세운다 */
function resendRoom(roomId: string): Promise<void> {
  const waiting = (useChatOutbox.getState().items[roomId] ?? [])
    .filter((i) => i.waiting)
    .sort((a, b) => a.queuedAt - b.queuedAt);
  if (waiting.length === 0) return Promise.resolve();
  const ctx = contextOf(roomId);
  if (!ctx) {
    // 앱을 막 켜서 이 방이 어느 여행인지 아직 모른다(대화방 목록을 받는 중). 조금 뒤 다시 본다
    scheduleResend(roomId);
    return Promise.resolve();
  }
  let last: Promise<void> = Promise.resolve();
  for (const { clientMessageId } of waiting) {
    last = enqueue(roomId, async () => {
      const current = useChatOutbox
        .getState()
        .items[roomId]?.find((i) => i.clientMessageId === clientMessageId);
      // 그사이 실시간·빈칸 채우기로 서버 메시지가 들어와 지워졌거나, 사용자가 지웠다
      if (!current?.waiting) return;
      // 자동으로 다시 보낼 시간이 지났다. 몇 시간 전 메시지가 연결되는 순간 단톡방에 올라가지 않게
      // [다시 보내기]로 넘겨 사용자가 고르게 한다(2026-11-10 점검). 이 확인은 실패 뒤에만 했었다
      if (!canWait(current.retryingSince)) {
        useChatOutbox.getState().markFailed(roomId, clientMessageId, 'retry');
        return;
      }
      useChatOutbox.getState().resume(roomId, clientMessageId);
      await deliver(ctx.queryClient, ctx.tripId, roomId, clientMessageId, ctx.onBlocked);
    });
  }
  return last;
}

/** 연결이 돌아왔을 때 부른다. 기다리던 메시지를 방마다 바로 다시 보낸다(앱을 다시 켠 뒤 저장돼 있던 것 포함) */
export function resendWaitingNow(): Promise<void> {
  const jobs: Promise<void>[] = [];
  const { resendTimers: timers } = chatSync();
  for (const roomId of Object.keys(useChatOutbox.getState().items)) {
    const t = timers.get(roomId);
    if (t?.timer) {
      clearTimeout(t.timer);
      t.timer = null;
    }
    jobs.push(resendRoom(roomId));
  }
  return Promise.all(jobs).then(() => undefined);
}

/** 자동 재전송 타이머만 멈춘다(테스트 정리용). 로그아웃은 stopChatSync가 세션 전체를 멈춘다 */
export function stopAutoResend() {
  const s = chatSync();
  for (const t of s.resendTimers.values()) if (t.timer) clearTimeout(t.timer);
  s.resendTimers.clear();
  s.sendContexts.clear();
}

/** 아직 자동으로 다시 보낼 시간 안인지 */
function canWait(retryingSince: number | null | undefined) {
  if (autoResend.windowMs <= 0) return false;
  return retryingSince == null || autoResend.now() - retryingSince < autoResend.windowMs;
}

async function deliver(
  queryClient: QueryClient,
  tripId: string,
  roomId: string,
  clientMessageId: string,
  onBlocked?: () => void,
) {
  const outbox = useChatOutbox.getState();
  const list = outbox.items[roomId] ?? [];
  const item = list.find((i) => i.clientMessageId === clientMessageId);
  // 기다리는 사이 [지우기]했거나 이미 서버 메시지로 바뀌었다
  if (!item || item.status !== 'sending') return;
  const s = chatSync();
  s.sendContexts.set(roomId, { queryClient, tripId, onBlocked });
  // 앞에 쓴 메시지가 연결을 기다리는 중이면 이것도 기다린다. 먼저 보내면 서버 순서가 뒤바뀐다
  if (list.some((i) => i.waiting && i.queuedAt < item.queuedAt)) {
    outbox.markWaiting(roomId, clientMessageId, autoResend.now());
    scheduleResend(roomId);
    return;
  }
  try {
    const message = await sendMessage(roomId, { clientMessageId, text: item.text }, s.signal);
    // 응답을 기다리는 사이 로그아웃했다. 비운 캐시에 이전 사용자의 대화를 다시 쓰지 않는다
    if (s.stopped) return;
    const t = s.resendTimers.get(roomId);
    if (t) t.attempt = 0;
    // 실시간과 같은 입구로 넣는다. 그래야 동시에 보낸 다른 사람 메시지(그 사이 순번)의 실시간을 놓쳤을 때
    // 내 응답이 그 빈칸을 가리지 않고 빈칸 채우기가 시작된다(C5-A)
    receive(queryClient, tripId, roomId, [message], 'send');
    useChatOutbox.getState().remove(roomId, clientMessageId);
  } catch (error) {
    if (s.stopped) return;
    const failure = sendFailure(error);
    if (failure === 'blocked') {
      useChatOutbox.getState().markFailed(roomId, clientMessageId, 'retry');
      onBlocked?.();
      return;
    }
    // 연결·서버 문제면 바로 실패를 띄우지 않고 연결을 기다렸다 같은 번호표로 다시 보낸다
    const latest = useChatOutbox
      .getState()
      .items[roomId]?.find((i) => i.clientMessageId === clientMessageId);
    if (failure === 'retry' && latest && canWait(latest.retryingSince)) {
      useChatOutbox.getState().markWaiting(roomId, clientMessageId, autoResend.now());
      scheduleResend(roomId);
      return;
    }
    useChatOutbox.getState().markFailed(roomId, clientMessageId, failure);
  }
}

/**
 * S47 보내기. 누르면 서버 응답을 기다리지 않고 "전송 중"으로 바로 보인다(SC-001).
 * 다시 보낼 때는 같은 clientMessageId·본문을 써서 서버에 두 번 저장되지 않는다(SC-004).
 * 연결 문제로 못 보내면 연결이 돌아올 때 자동으로 다시 보낸다(autoResend)
 */
export function useSendMessage(tripId: string, roomId: string | undefined, options: Options = {}) {
  const queryClient = useQueryClient();
  const { onBlocked } = options;

  const send = useCallback(
    (text: string) => {
      if (!roomId) return;
      const item = useChatOutbox.getState().enqueue(roomId, cleanMessageText(text));
      return enqueue(roomId, () =>
        deliver(queryClient, tripId, roomId, item.clientMessageId, onBlocked),
      );
    },
    [queryClient, tripId, roomId, onBlocked],
  );

  const retry = useCallback(
    (clientMessageId: string) => {
      if (!roomId) return;
      useChatOutbox.getState().markSending(roomId, clientMessageId);
      return enqueue(roomId, () =>
        deliver(queryClient, tripId, roomId, clientMessageId, onBlocked),
      );
    },
    [queryClient, tripId, roomId, onBlocked],
  );

  const discard = useCallback(
    (clientMessageId: string) => {
      if (roomId) useChatOutbox.getState().remove(roomId, clientMessageId);
    },
    [roomId],
  );

  return { send, retry, discard };
}
