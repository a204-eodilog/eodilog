import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { OutboxItem } from '../types';

import { createOutboxStorage } from './outbox-storage';

type OutboxState = {
  /** roomId별 보내는 중·못 보낸 메시지. 기기에 저장돼 앱을 다시 켜도 남는다(로그아웃하면 지운다) */
  items: Record<string, OutboxItem[]>;
  /** 새 메시지. 메시지마다 새 clientMessageId를 만든다 */
  enqueue: (roomId: string, text: string) => OutboxItem;
  markFailed: (roomId: string, clientMessageId: string, failure: 'retry' | 'rejected') => void;
  /** [다시 보내기]. 같은 clientMessageId와 본문으로 다시 보낸다. 자동 재전송 시간도 처음부터 센다 */
  markSending: (roomId: string, clientMessageId: string) => void;
  /** 연결 문제로 못 보냈다. 연결이 돌아오면 자동으로 다시 보낸다(since: 처음 못 보낸 시각) */
  markWaiting: (roomId: string, clientMessageId: string, since: number) => void;
  /** 자동으로 다시 보내기 직전. 기다림을 풀고 보내는 중으로 둔다 */
  resume: (roomId: string, clientMessageId: string) => void;
  /** 서버가 받았거나 [지우기] */
  remove: (roomId: string, clientMessageId: string) => void;
  /** 서버에 나타난 내 메시지와 짝이 맞는 것을 한꺼번에 뺀다 */
  replace: (roomId: string, items: OutboxItem[]) => void;
  clearRoom: (roomId: string) => void;
  clearAll: () => void;
};

/** 같은 밀리초에 두 번 보내도 순서가 뒤집히지 않게 늘어나는 번호를 쓴다. 앱을 다시 켜면 저장된 것 다음부터 센다 */
let order = 0;

/**
 * 저장돼 있던 보내는 중 메시지를 되살린다.
 * 보내는 도중(응답을 기다리다) 앱이 꺼졌으면 서버가 받았는지 모르므로 "연결되면 보내요"로 두어 같은 번호표로 다시 보낸다.
 * 서버가 이미 받았으면 같은 번호표라 저장해 둔 메시지를 돌려준다(멱등).
 * 기다린 시간은 보내기를 누른 때(sentAt)부터 센다. 지금(now)부터 세면 몇 시간 전 메시지도 방금 실패한 것처럼
 * 자동으로 보내졌다(2026-11-10 점검). 정해진 시간이 지났으면 다시 연결될 때 [다시 보내기]로 넘어간다
 */
export function restoreOutbox(items: Record<string, OutboxItem[]>, now: number) {
  const restored: Record<string, OutboxItem[]> = {};
  for (const [roomId, list] of Object.entries(items)) {
    restored[roomId] = list.map((i) =>
      i.status === 'sending' && !i.waiting
        ? { ...i, waiting: true, retryingSince: i.retryingSince ?? i.sentAt ?? now }
        : i,
    );
    for (const i of list) order = Math.max(order, i.queuedAt);
  }
  return restored;
}

const EMPTY: OutboxItem[] = [];

function update(
  items: Record<string, OutboxItem[]>,
  roomId: string,
  fn: (list: OutboxItem[]) => OutboxItem[],
) {
  const next = fn(items[roomId] ?? EMPTY);
  const copy = { ...items };
  if (next.length === 0) delete copy[roomId];
  else copy[roomId] = next;
  return copy;
}

/**
 * 보내는 중 메시지 큐(data-model "보내는 중인 메시지"). 서버 데이터가 아니라 zustand에 둔다(research R6).
 * 일반 채팅앱처럼 기기에 저장해(MMKV), 앱을 껐다 켜도 못 보낸 메시지를 이어서 보낸다(2026-11-06)
 */
export const useChatOutbox = create<OutboxState>()(
  persist(
    (set) => ({
      items: {},
      enqueue: (roomId, text) => {
        order += 1;
        const item: OutboxItem = {
          clientMessageId: randomUUID(),
          roomId,
          text,
          status: 'sending',
          failure: null,
          queuedAt: order,
          sentAt: Date.now(),
        };
        set((s) => ({ items: update(s.items, roomId, (list) => [...list, item]) }));
        return item;
      },
      markFailed: (roomId, id, failure) =>
        set((s) => ({
          items: update(s.items, roomId, (list) =>
            list.map((i) =>
              i.clientMessageId === id ? { ...i, status: 'failed', failure, waiting: false } : i,
            ),
          ),
        })),
      markSending: (roomId, id) =>
        set((s) => ({
          items: update(s.items, roomId, (list) =>
            list.map((i) =>
              i.clientMessageId === id
                ? {
                    ...i,
                    status: 'sending',
                    failure: null,
                    waiting: false,
                    retryingSince: null,
                    sentAt: Date.now(),
                  }
                : i,
            ),
          ),
        })),
      markWaiting: (roomId, id, since) =>
        set((s) => ({
          items: update(s.items, roomId, (list) =>
            list.map((i) =>
              i.clientMessageId === id
                ? {
                    ...i,
                    status: 'sending',
                    failure: null,
                    waiting: true,
                    retryingSince: i.retryingSince ?? since,
                  }
                : i,
            ),
          ),
        })),
      resume: (roomId, id) =>
        set((s) => ({
          items: update(s.items, roomId, (list) =>
            list.map((i) => (i.clientMessageId === id ? { ...i, waiting: false } : i)),
          ),
        })),
      remove: (roomId, id) =>
        set((s) => ({
          items: update(s.items, roomId, (list) => list.filter((i) => i.clientMessageId !== id)),
        })),
      replace: (roomId, next) => set((s) => ({ items: update(s.items, roomId, () => next) })),
      clearRoom: (roomId) => set((s) => ({ items: update(s.items, roomId, () => EMPTY) })),
      clearAll: () => set({ items: {} }),
    }),
    {
      name: 'chat-outbox',
      version: 1,
      storage: createJSONStorage(createOutboxStorage),
      partialize: (s) => ({ items: s.items }),
      merge: (saved, current) => {
        const items = (saved as { items?: Record<string, OutboxItem[]> } | undefined)?.items;
        return items ? { ...current, items: restoreOutbox(items, Date.now()) } : current;
      },
    },
  ),
);

/** 그 방의 보내는 중 메시지. 없으면 늘 같은 빈 배열이라 다시 그리지 않는다 */
export function useRoomOutbox(roomId: string | undefined): OutboxItem[] {
  return useChatOutbox((s) => (roomId ? (s.items[roomId] ?? EMPTY) : EMPTY));
}
