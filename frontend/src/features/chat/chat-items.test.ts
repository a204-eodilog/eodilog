import { describe, expect, it } from '@jest/globals';

import type { UserCard } from '@/api/types';

import { toChatItems } from './chat-items';
import { emptyWindow, mergeMessages } from './message-merge';
import { msg } from './testing';
import type { OutboxItem } from './types';

const person = (id: string, nickname: string): UserCard => ({
  id,
  nickname,
  profileImageUrl: null,
  accountVisibility: 'PUBLIC',
  followingStatus: 'NONE',
  followedByStatus: 'NONE',
});
const SEEUN = person('user-b', '세은');
const ctx = { meId: 'me', participants: [SEEUN], now: new Date('2026-11-05T12:00:00Z') };
const windowOf = (...messages: ReturnType<typeof msg>[]) =>
  mergeMessages(emptyWindow('room-1'), messages);

describe('화면 줄 만들기', () => {
  it('서울 날짜 경계(UTC 15:00)에 날짜 줄이 생긴다', () => {
    const items = toChatItems(
      windowOf(
        msg(1, { createdAt: '2026-11-04T14:59:00Z' }),
        msg(2, { createdAt: '2026-11-04T15:00:00Z' }),
      ),
      [],
      ctx,
    );
    expect(items.map((i) => i.kind)).toEqual(['day', 'message', 'day', 'message']);
    expect(items[0]).toMatchObject({ label: '11.04(수)' });
    expect(items[2]).toMatchObject({ label: '11.05(목)' });
  });

  it('같은 사람이 같은 서울 분에 이어 보내면 이름을 첫 줄에만 둔다', () => {
    const items = toChatItems(
      windowOf(
        msg(1, { createdAt: '2026-11-05T03:00:05Z' }),
        msg(2, { createdAt: '2026-11-05T03:00:40Z' }),
        msg(3, { createdAt: '2026-11-05T03:01:00Z' }),
      ),
      [],
      ctx,
    ).filter((i) => i.kind === 'message');
    expect(items.map((i) => i.kind === 'message' && i.showSender)).toEqual([true, false, true]);
  });

  it('지금 동행이 아니면 "나간 동행", 내 메시지는 이름이 없다', () => {
    const items = toChatItems(
      windowOf(msg(1, { senderId: 'gone' }), msg(2, { senderId: 'me' })),
      [],
      ctx,
    ).filter((i) => i.kind === 'message');
    expect(items[0]).toMatchObject({ senderName: '나간 동행', mine: false });
    expect(items[1]).toMatchObject({ senderName: null, mine: true, showSender: false });
  });

  it('지운 메시지는 deleted, 시스템 메시지는 system', () => {
    const items = toChatItems(
      windowOf(
        msg(1, { text: null, deletedAt: '2026-11-05T04:00:00Z' }),
        msg(2, { type: 'SYSTEM', senderId: null, text: '투표가 시작됐어요' }),
      ),
      [],
      ctx,
    );
    expect(items[1]).toMatchObject({ kind: 'message', deleted: true });
    expect(items[2]).toMatchObject({ kind: 'system' });
  });

  it('보내는 중 메시지는 서버 메시지 뒤에 보낸 순서로 오고, 오늘 첫 줄이면 날짜 줄이 생긴다', () => {
    const outbox: OutboxItem[] = [
      {
        clientMessageId: 'b',
        roomId: 'room-1',
        text: '둘',
        status: 'failed',
        failure: 'retry',
        queuedAt: 2,
      },
      {
        clientMessageId: 'a',
        roomId: 'room-1',
        text: '하나',
        status: 'sending',
        failure: null,
        queuedAt: 1,
      },
    ];
    const items = toChatItems(windowOf(msg(1, { createdAt: '2026-11-04T03:00:00Z' })), outbox, ctx);
    expect(items.map((i) => i.key)).toEqual([
      'day-2026-11-04',
      'msg-1',
      'day-2026-11-05',
      'a',
      'b',
    ]);
  });

  it('새 메시지가 와도 바뀌지 않은 줄은 같은 객체다(FlashList가 다시 그리지 않음, 트러블슈팅 D3)', () => {
    const before = windowOf(
      msg(1, { createdAt: '2026-11-05T03:00:00Z' }),
      msg(2, { createdAt: '2026-11-05T03:05:00Z' }),
    );
    const first = toChatItems(before, [], ctx);
    const after = mergeMessages(before, [msg(3, { createdAt: '2026-11-05T03:10:00Z' })]);
    const second = toChatItems(after, [], ctx);
    expect(second.slice(0, first.length)).toEqual(first);
    first.forEach((item, i) => expect(second[i]).toBe(item));
    expect(second).toHaveLength(first.length + 1);
  });

  it('보이는 내용이 바뀐 줄만 새 객체다', () => {
    const before = windowOf(
      msg(1, { createdAt: '2026-11-05T03:00:00Z' }),
      msg(2, { createdAt: '2026-11-05T03:05:00Z' }),
    );
    const first = toChatItems(before, [], ctx);
    // 1번 메시지를 보낸 사람이 지웠다(같은 순번으로 다시 옴)
    const deleted = mergeMessages(before, [
      msg(1, { createdAt: '2026-11-05T03:00:00Z', text: null, deletedAt: '2026-11-05T04:00:00Z' }),
    ]);
    const second = toChatItems(deleted, [], ctx);
    expect(second[1]).not.toBe(first[1]);
    expect(second[1]).toMatchObject({ deleted: true });
    expect(second[2]).toBe(first[2]);
    // 동행 이름이 바뀌면 그 사람 줄이 새로 만들어진다
    const renamed = toChatItems(deleted, [], { ...ctx, participants: [person('user-b', '세은2')] });
    expect(renamed[2]).not.toBe(second[2]);
    expect(renamed[2]).toMatchObject({ senderName: '세은2' });
  });

  it('창이 아직 없어도 보내는 중 메시지는 보인다', () => {
    const outbox: OutboxItem[] = [
      {
        clientMessageId: 'a',
        roomId: 'room-1',
        text: '하나',
        status: 'sending',
        failure: null,
        queuedAt: 1,
      },
    ];
    expect(toChatItems(undefined, outbox, ctx).map((i) => i.kind)).toEqual(['day', 'outbox']);
  });
});
