import type { Message, MessageWindow, OutboxItem } from './types';

/**
 * 메시지 합치기 규칙(research R7, data-model "계산 함수").
 * 처음 받기·이전 메시지·실시간·빈칸 채우기·이어 받기·보내기 성공이 모두 이 함수들을 거친다.
 * 서버는 방마다 sequence를 1부터 빈틈없이 매기므로 빈칸을 계산할 수 있다. 모두 원본을 바꾸지 않는다
 */

/** 한 번에 받을 수 있는 최대 개수(서버 limit 최대값) */
const MAX_LIMIT = 100;

export function emptyWindow(roomId: string): MessageWindow {
  return {
    roomId,
    messages: [],
    oldestSequence: null,
    newestSequence: null,
    hasOlder: true,
    stale: false,
  };
}

/**
 * incoming을 창에 합친다.
 * - id로 중복을 뺀다. 같은 sequence가 오면 들어온 것으로 덮어쓴다(지운 메시지의 deletedAt 반영)
 * - sequence 오름차순으로 정렬하고 oldest·newest를 다시 계산한다
 * - 다른 방의 메시지는 버린다
 */
export function mergeMessages(
  window: MessageWindow,
  incoming: readonly Message[],
  opts: { hasOlder?: boolean; stale?: boolean } = {},
): MessageWindow {
  const fresh = incoming.filter((m) => m.roomId === window.roomId);
  if (fresh.length === 0 && opts.hasOlder === undefined && opts.stale === undefined) {
    return window;
  }
  const bySequence = new Map<number, Message>();
  for (const m of window.messages) bySequence.set(m.sequence, m);
  const incomingIds = new Set(fresh.map((m) => m.id));
  // 같은 id가 다른 sequence로 남아 있으면 지운다(서버가 순번을 바꾸지는 않지만 중복 표시를 막는다)
  for (const [seq, m] of bySequence) {
    if (incomingIds.has(m.id)) bySequence.delete(seq);
  }
  for (const m of fresh) bySequence.set(m.sequence, m);

  const messages = [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
  return {
    roomId: window.roomId,
    messages,
    oldestSequence: messages[0]?.sequence ?? null,
    newestSequence: messages[messages.length - 1]?.sequence ?? null,
    hasOlder: opts.hasOlder ?? window.hasOlder,
    stale: opts.stale ?? window.stale,
  };
}

export type Gap = { after: number; before: number };

/**
 * 실시간 메시지가 마지막으로 받은 것보다 둘 이상 크면 그 사이가 빈다.
 * 아직 처음 받기 전(newestSequence가 없음)이면 빈칸으로 보지 않는다
 */
export function findGap(window: MessageWindow, message: Message): Gap | null {
  const newest = window.newestSequence;
  if (newest === null) return null;
  if (message.sequence > newest + 1) return { after: newest, before: message.sequence };
  return null;
}

/**
 * 커서: 창의 가장 오래된 메시지부터 빈틈없이 이어진 마지막 sequence(2026-11-06 동기화 엔진).
 * 받은 길(실시간·보내기 응답·빈칸 채우기·이어 받기·처음 받기)과 상관없이 이 값 하나로 "어디까지 받았나"를 판단한다.
 * 처음 받기 전이면 null
 */
export function syncedUpTo(window: MessageWindow): number | null {
  if (window.oldestSequence === null) return null;
  let cursor = window.oldestSequence;
  for (const m of window.messages) {
    if (m.sequence === cursor + 1) cursor = m.sequence;
    else if (m.sequence > cursor + 1) break;
  }
  return cursor;
}

/** 커서 위에 빈칸이 있으면 채울 구간. 없으면 null */
export function holesAboveCursor(window: MessageWindow): Gap | null {
  const cursor = syncedUpTo(window);
  const newest = window.newestSequence;
  if (cursor === null || newest === null || cursor >= newest) return null;
  return { after: cursor, before: newest + 1 };
}

/** after와 before 사이(둘 다 제외)에서 창에 없는 가장 큰 sequence. 없으면 null */
function largestMissing(window: MessageWindow, after: number, before: number): number | null {
  const have = new Set(window.messages.map((m) => m.sequence));
  for (let s = before - 1; s > after; s -= 1) {
    if (!have.has(s)) return s;
  }
  return null;
}

/**
 * 빈칸을 채울 다음 요청. 위쪽(최신)부터 아래로 내려가며 채운다.
 * 다 채웠으면 null. 예: 빠진 250개는 limit 100·100·50으로 세 번 요청한다
 */
export function nextFillRequest(
  window: MessageWindow,
  gap: Gap,
): { beforeSequence: number; limit: number } | null {
  const top = largestMissing(window, gap.after, gap.before);
  if (top === null) return null;
  return { beforeSequence: top + 1, limit: Math.min(MAX_LIMIT, top - gap.after) };
}

/**
 * 다시 연결·앱 복귀 뒤 이어 받기. 최신 페이지를 합친 창에서, 받기 전 마지막 sequence(knownNewest)까지
 * 비어 있는 곳이 있으면 다음 요청을 정한다. 다 이어졌거나 처음 받기 전이었으면 null
 */
export function nextCatchUpRequest(
  window: MessageWindow,
  knownNewest: number | null,
): { beforeSequence: number; limit: number } | null {
  if (knownNewest === null || window.newestSequence === null) return null;
  return nextFillRequest(window, { after: knownNewest, before: window.newestSequence + 1 });
}

/**
 * 서버에 나타난 내 메시지와 짝이 맞는 보내는 중 항목을 뺀다.
 * 서버 응답·실시간·이어 받기 중 무엇이 먼저 와도 같다. 다른 사람의 같은 clientMessageId로는 빼지 않는다
 */
export function reconcileOutbox(
  items: readonly OutboxItem[],
  messages: readonly Message[],
  myUserId: string | null,
): OutboxItem[] {
  if (!myUserId) return [...items];
  const sent = new Set(
    messages
      .filter((m) => m.senderId === myUserId && m.clientMessageId)
      .map((m) => `${m.roomId}:${m.clientMessageId}`),
  );
  return items.filter((item) => !sent.has(`${item.roomId}:${item.clientMessageId}`));
}

/** 대화방 목록의 최근 메시지 바꾸기. 더 큰 sequence만 이긴다. 같으면 새로 온 것(지운 표시 반영) */
export function latestOf(current: Message | null, next: Message | null): Message | null {
  if (!current) return next;
  if (!next) return current;
  return next.sequence >= current.sequence ? next : current;
}
