import { describe, expect, it } from '@jest/globals';

import {
  emptyWindow,
  findGap,
  holesAboveCursor,
  latestOf,
  mergeMessages,
  nextCatchUpRequest,
  nextFillRequest,
  reconcileOutbox,
  syncedUpTo,
} from './message-merge';
import { msg, range } from './testing';
import type { MessageWindow, OutboxItem } from './types';

const seqs = (w: MessageWindow) => w.messages.map((m) => m.sequence);

describe('합치기 규칙', () => {
  it('같은 id가 두 번 오면 하나만 남는다', () => {
    const w = mergeMessages(mergeMessages(emptyWindow('room-1'), [msg(1), msg(2)]), [msg(2)]);
    expect(seqs(w)).toEqual([1, 2]);
  });

  it('같은 sequence에 지운 표시가 붙은 메시지가 오면 덮어쓴다', () => {
    const base = mergeMessages(emptyWindow('room-1'), [msg(1), msg(2)]);
    const deleted = msg(2, { text: null, deletedAt: '2026-11-05T04:00:00Z' });
    const w = mergeMessages(base, [deleted]);
    expect(w.messages[1]).toEqual(deleted);
    expect(w.messages).toHaveLength(2);
  });

  it('섞인 순서와 내림차순 페이지를 합쳐도 오름차순이다', () => {
    const w1 = mergeMessages(emptyWindow('room-1'), [msg(3), msg(1), msg(2)]);
    expect(seqs(w1)).toEqual([1, 2, 3]);
    const w2 = mergeMessages(w1, range(4, 8).reverse());
    expect(seqs(w2)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('oldest·newest·hasOlder를 다시 계산한다', () => {
    const w = mergeMessages(emptyWindow('room-1'), range(21, 50), { hasOlder: true });
    expect(w.oldestSequence).toBe(21);
    expect(w.newestSequence).toBe(50);
    expect(w.hasOlder).toBe(true);
    const older = mergeMessages(w, range(1, 20), { hasOlder: false });
    expect(older.oldestSequence).toBe(1);
    expect(older.hasOlder).toBe(false);
  });

  it('원래 창은 바뀌지 않는다', () => {
    const base = mergeMessages(emptyWindow('room-1'), [msg(1)]);
    const before = JSON.stringify(base);
    mergeMessages(base, [msg(2)], { stale: true });
    expect(JSON.stringify(base)).toBe(before);
  });

  it('다른 방 메시지는 버리고, 들어온 것이 없으면 같은 창을 돌려준다', () => {
    const base = mergeMessages(emptyWindow('room-1'), [msg(1)]);
    expect(mergeMessages(base, [msg(2, { roomId: 'room-2' })])).toBe(base);
  });
});

describe('빈칸', () => {
  const window10 = mergeMessages(emptyWindow('room-1'), range(1, 10));

  it('newest 10에 12가 오면 빈칸, 11이면 빈칸 없음', () => {
    expect(findGap(window10, msg(12))).toEqual({ after: 10, before: 12 });
    expect(findGap(window10, msg(11))).toBeNull();
  });

  it('처음 받기 전에는 빈칸이 없다', () => {
    expect(findGap(emptyWindow('room-1'), msg(40))).toBeNull();
  });

  it('빈칸 하나는 요청 한 번으로 채운다', () => {
    const w = mergeMessages(window10, [msg(12)]);
    expect(nextFillRequest(w, { after: 10, before: 12 })).toEqual({ beforeSequence: 12, limit: 1 });
    const filled = mergeMessages(w, [msg(11)]);
    expect(nextFillRequest(filled, { after: 10, before: 12 })).toBeNull();
  });

  it('빠진 250개는 beforeSequence 순서대로 100·100·50으로 받는다', () => {
    let w = mergeMessages(window10, [msg(261)]);
    const gap = { after: 10, before: 261 };
    const plan: { beforeSequence: number; limit: number }[] = [];
    for (let req = nextFillRequest(w, gap); req; req = nextFillRequest(w, gap)) {
      plan.push(req);
      // 서버는 beforeSequence보다 작은 것을 limit개 내림차순으로 준다
      w = mergeMessages(w, range(req.beforeSequence - req.limit, req.beforeSequence - 1).reverse());
    }
    expect(plan).toEqual([
      { beforeSequence: 261, limit: 100 },
      { beforeSequence: 161, limit: 100 },
      { beforeSequence: 61, limit: 50 },
    ]);
    expect(seqs(w)).toEqual(range(1, 261).map((m) => m.sequence));
  });

  it('최신 페이지가 기억하던 newest에 닿으면 이어 받기 요청이 없다', () => {
    const w = mergeMessages(window10, range(11, 17).reverse());
    expect(nextCatchUpRequest(w, 10)).toBeNull();
  });

  it('최신 페이지가 newest에 닿지 않으면 그 아래부터 이어 받는다', () => {
    const w = mergeMessages(window10, range(161, 260));
    expect(nextCatchUpRequest(w, 10)).toEqual({ beforeSequence: 161, limit: 100 });
  });

  it('처음 받기 전이었으면 이어 받기 요청이 없다', () => {
    expect(nextCatchUpRequest(mergeMessages(emptyWindow('room-1'), range(1, 5)), null)).toBeNull();
  });
});

describe('보내는 중 메시지 교체', () => {
  const item = (id: string, over: Partial<OutboxItem> = {}): OutboxItem => ({
    clientMessageId: id,
    roomId: 'room-1',
    text: '안녕',
    status: 'sending',
    failure: null,
    queuedAt: 1,
    ...over,
  });

  it('내 clientMessageId가 서버에 나타나면 뺀다', () => {
    const server = [msg(5, { senderId: 'me', clientMessageId: 'c1' })];
    expect(reconcileOutbox([item('c1'), item('c2')], server, 'me')).toEqual([item('c2')]);
  });

  it('다른 사람의 같은 clientMessageId로는 빼지 않는다', () => {
    const server = [msg(5, { senderId: 'other', clientMessageId: 'c1' })];
    expect(reconcileOutbox([item('c1')], server, 'me')).toHaveLength(1);
  });

  it('다른 방의 같은 clientMessageId로는 빼지 않는다', () => {
    const server = [msg(5, { senderId: 'me', clientMessageId: 'c1', roomId: 'room-2' })];
    expect(reconcileOutbox([item('c1')], server, 'me')).toHaveLength(1);
  });
});

describe('목록의 최근 메시지', () => {
  it('더 작은 sequence로 되돌리지 않는다', () => {
    expect(latestOf(msg(5), msg(4))?.sequence).toBe(5);
    expect(latestOf(msg(5), msg(6))?.sequence).toBe(6);
    expect(latestOf(null, msg(1))?.sequence).toBe(1);
  });

  it('같은 sequence면 새로 온 것(지운 표시)을 쓴다', () => {
    const deleted = msg(5, { deletedAt: '2026-11-05T04:00:00Z' });
    expect(latestOf(msg(5), deleted)).toBe(deleted);
  });
});

describe('커서', () => {
  const win = (seqs: number[]) =>
    mergeMessages(
      emptyWindow('room-1'),
      seqs.map((n) => msg(n)),
    );

  it('빈틈없이 이어지면 커서는 가장 새 순번이고 빈칸이 없다', () => {
    const w = win([5, 6, 7, 8]);
    expect(syncedUpTo(w)).toBe(8);
    expect(holesAboveCursor(w)).toBeNull();
  });

  it('중간이 비면 커서는 빈칸 앞에서 멈추고, 커서부터 가장 새 것까지가 채울 구간이다', () => {
    const w = win([5, 6, 8, 11]);
    expect(syncedUpTo(w)).toBe(6);
    expect(holesAboveCursor(w)).toEqual({ after: 6, before: 12 });
  });

  it('처음 받기 전이면 커서가 없다', () => {
    expect(syncedUpTo(emptyWindow('room-1'))).toBeNull();
    expect(holesAboveCursor(emptyWindow('room-1'))).toBeNull();
  });
});
