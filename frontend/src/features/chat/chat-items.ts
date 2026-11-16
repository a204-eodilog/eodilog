import type { UserCard } from '@/api/types';

import { dayDividerLabel, LEFT_MEMBER, messageTimeLabel, seoulDateOf } from './chat-rules';
import type { Message, MessageWindow, OutboxItem } from './types';

/** FlashList 한 줄. 날짜 구분 줄·사람 메시지·시스템 카드·보내는 중 메시지 */
export type ChatItem =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'message';
      key: string;
      message: Message;
      mine: boolean;
      /** 같은 사람이 같은 분에 이어 보냈으면 false. 얼굴·이름은 첫 줄에만 둔다 */
      showSender: boolean;
      senderName: string | null;
      senderImageUrl: string | null;
      time: string;
      deleted: boolean;
    }
  | { kind: 'system'; key: string; message: Message; time: string }
  | { kind: 'outbox'; key: string; item: OutboxItem };

type Context = {
  meId: string | null;
  /** 지금 참여 중인 동행. 없는 사람은 "나간 동행" */
  participants: readonly UserCard[];
  /** 보내는 중 메시지의 날짜를 정할 지금 시각 */
  now?: Date;
};

/** 메시지마다 한 번만 구하는 서울 날짜·시각. createdAt은 바뀌지 않으므로 메시지 객체에 묶어 둔다 */
type Stamp = { date: string; time: string };
const stamps = new WeakMap<Message, Stamp>();

function stampOf(m: Message): Stamp {
  let s = stamps.get(m);
  if (!s) {
    s = { date: seoulDateOf(m.createdAt), time: messageTimeLabel(m.createdAt) };
    stamps.set(m, s);
  }
  return s;
}

/**
 * 지난번에 만든 줄. 내용이 같으면 같은 객체를 다시 돌려준다(트러블슈팅 D3).
 * FlashList는 줄 객체가 같으면 그 칸을 다시 그리지 않으므로, 새 메시지가 와도 이미 보이던 말풍선은 그대로 둔다
 */
const lastItems = new WeakMap<Message | OutboxItem, ChatItem>();
/** 날짜 구분 줄은 날짜만으로 정해진다. 날짜 수만큼만 쌓인다 */
const dayItems = new Map<string, ChatItem>();

function dayItem(date: string): ChatItem {
  let item = dayItems.get(date);
  if (!item) {
    item = { kind: 'day', key: `day-${date}`, label: dayDividerLabel(date) };
    dayItems.set(date, item);
  }
  return item;
}

type MessageItem = Extract<ChatItem, { kind: 'message' }>;

function sameMessageItem(a: ChatItem | undefined, b: MessageItem): a is MessageItem {
  return (
    a?.kind === 'message' &&
    a.message === b.message &&
    a.mine === b.mine &&
    a.showSender === b.showSender &&
    a.senderName === b.senderName &&
    a.senderImageUrl === b.senderImageUrl &&
    a.time === b.time &&
    a.deleted === b.deleted
  );
}

/**
 * 메시지 창과 보내는 중 큐를 화면 줄 목록으로 바꾼다(data-model "chat-items.ts").
 * - 서울 날짜가 바뀌는 첫 메시지 앞에 날짜 구분 줄을 넣는다
 * - 보내는 중 메시지는 서버 메시지 뒤에 보낸 순서로 놓는다. 오늘 첫 줄이면 앞에 날짜 줄이 생긴다
 * - 바뀌지 않은 줄은 지난번 객체를 그대로 쓴다. 날짜·시각 계산도 메시지마다 한 번만 한다
 */
export function toChatItems(
  window: MessageWindow | undefined,
  outbox: readonly OutboxItem[],
  { meId, participants, now = new Date() }: Context,
): ChatItem[] {
  const items: ChatItem[] = [];
  const people = new Map(participants.map((p) => [p.id, p]));
  let lastDate: string | null = null;
  let prev: { message: Message; time: string } | null = null;

  for (const m of window?.messages ?? []) {
    const { date, time } = stampOf(m);
    if (date !== lastDate) {
      items.push(dayItem(date));
      lastDate = date;
      prev = null;
    }
    if (m.type === 'SYSTEM') {
      let item = lastItems.get(m);
      if (item?.kind !== 'system') {
        item = { kind: 'system', key: m.id, message: m, time };
        lastItems.set(m, item);
      }
      items.push(item);
      prev = { message: m, time };
      continue;
    }
    const mine = !!meId && m.senderId === meId;
    const continued =
      !!prev &&
      prev.message.type === 'TEXT' &&
      prev.message.senderId === m.senderId &&
      prev.time === time;
    const participant = m.senderId ? people.get(m.senderId) : undefined;
    const next: MessageItem = {
      kind: 'message',
      key: m.id,
      message: m,
      mine,
      showSender: !mine && !continued,
      senderName: mine || !m.senderId ? null : (participant?.nickname ?? LEFT_MEMBER),
      senderImageUrl: participant?.profileImageUrl ?? null,
      time,
      deleted: !!m.deletedAt,
    };
    const before = lastItems.get(m);
    if (sameMessageItem(before, next)) {
      items.push(before);
    } else {
      lastItems.set(m, next);
      items.push(next);
    }
    prev = { message: m, time };
  }

  if (outbox.length > 0) {
    const today = seoulDateOf(now.toISOString());
    if (today !== lastDate) items.push(dayItem(today));
    for (const entry of [...outbox].sort((a, b) => a.queuedAt - b.queuedAt)) {
      let item = lastItems.get(entry);
      if (item?.kind !== 'outbox') {
        item = { kind: 'outbox', key: entry.clientMessageId, item: entry };
        lastItems.set(entry, item);
      }
      items.push(item);
    }
  }
  return items;
}
