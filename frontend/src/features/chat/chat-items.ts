import type { UserCard } from '@/api/types';

import { dayDividerLabel, messageTimeLabel, senderLabel, seoulDateOf } from './chat-rules';
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

/**
 * 메시지 창과 보내는 중 큐를 화면 줄 목록으로 바꾼다(data-model "chat-items.ts").
 * - 서울 날짜가 바뀌는 첫 메시지 앞에 날짜 구분 줄을 넣는다
 * - 보내는 중 메시지는 서버 메시지 뒤에 보낸 순서로 놓는다. 오늘 첫 줄이면 앞에 날짜 줄이 생긴다
 */
export function toChatItems(
  window: MessageWindow | undefined,
  outbox: readonly OutboxItem[],
  { meId, participants, now = new Date() }: Context,
): ChatItem[] {
  const items: ChatItem[] = [];
  let lastDate: string | null = null;
  let prev: Message | null = null;

  for (const m of window?.messages ?? []) {
    const date = seoulDateOf(m.createdAt);
    if (date !== lastDate) {
      items.push({ kind: 'day', key: `day-${date}`, label: dayDividerLabel(date) });
      lastDate = date;
      prev = null;
    }
    const time = messageTimeLabel(m.createdAt);
    if (m.type === 'SYSTEM') {
      items.push({ kind: 'system', key: m.id, message: m, time });
      prev = m;
      continue;
    }
    const mine = !!meId && m.senderId === meId;
    const continued =
      !!prev &&
      prev.type === 'TEXT' &&
      prev.senderId === m.senderId &&
      messageTimeLabel(prev.createdAt) === time;
    const participant = participants.find((p) => p.id === m.senderId);
    items.push({
      kind: 'message',
      key: m.id,
      message: m,
      mine,
      showSender: !mine && !continued,
      senderName: mine ? null : senderLabel(m, participants),
      senderImageUrl: participant?.profileImageUrl ?? null,
      time,
      deleted: !!m.deletedAt,
    });
    prev = m;
  }

  if (outbox.length > 0) {
    const today = seoulDateOf(now.toISOString());
    if (today !== lastDate) {
      items.push({ kind: 'day', key: `day-${today}`, label: dayDividerLabel(today) });
    }
    for (const item of [...outbox].sort((a, b) => a.queuedAt - b.queuedAt)) {
      items.push({ kind: 'outbox', key: item.clientMessageId, item });
    }
  }
  return items;
}
