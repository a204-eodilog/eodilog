import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createChatStorage } from './hooks/outbox-storage';

/** 숫자 대신 "99+"로 줄여 보이기 시작하는 수 */
export const UNREAD_CAP = 99;

/**
 * 안 읽은 메시지 수. 방의 가장 최근 순번에서 내가 읽은 순번을 뺀다.
 * 메시지 순번은 1부터 빈틈없이 늘어나서(types.ts Message.sequence) 뺀 값이 그대로 개수다.
 * 읽은 기록이 없는 방은 0으로 본다(처음 본 방의 지난 대화를 모두 안 읽음으로 세지 않는다)
 */
export function unreadOf(latest: number | undefined, read: number | undefined): number {
  if (latest === undefined || read === undefined) return 0;
  return Math.max(0, latest - read);
}

/** 배지에 쓰는 글. 0이면 null(배지를 그리지 않는다), 99를 넘으면 "99+" */
export function unreadLabel(count: number): string | null {
  if (count <= 0) return null;
  return count > UNREAD_CAP ? `${UNREAD_CAP}+` : String(count);
}

type ReadsState = {
  /** 방마다 내가 읽은 마지막 순번 */
  read: Record<string, number>;
  /** 방마다 지금까지 알게 된 가장 최근 순번 */
  latest: Record<string, number>;
  /**
   * 목록에서 방의 최근 메시지를 봤다. 처음 보는 방이면 거기까지 읽은 것으로 시작한다
   * (앱을 처음 깔았을 때 지난 대화가 모두 안 읽음으로 뜨지 않게)
   */
  noteRoom(roomId: string, sequence: number): void;
  /**
   * 새 메시지가 왔다. 처음 보는 방이면 그 메시지 하나만 안 읽은 것으로 시작한다.
   * 내가 보낸 메시지면 거기까지 읽은 것으로 친다(다른 기기에서 보낸 내 메시지를 안 읽음으로 세지 않는다)
   */
  noteMessage(roomId: string, sequence: number, mine: boolean): void;
  /** 대화방을 열어 이 순번까지 봤다 */
  markRead(roomId: string, sequence: number): void;
  clearAll(): void;
};

const max = (a: number | undefined, b: number) => (a === undefined ? b : Math.max(a, b));

/**
 * 채팅 안 읽은 수(카카오톡처럼 방마다 몇 개, 채팅 탭에 모두 몇 개).
 * 서버에는 대화 읽음이 없다(api-spec "대화 읽음 규격은 추가하지 않는다"). 그래서 이 기기에서 어디까지 읽었는지를
 * 기기에 적어 두고(MMKV) 센다. 같은 계정을 다른 기기에서 쓰면 그 기기는 따로 센다.
 * 2026-11-14 사용자 요청으로 넣었다(전에는 "미확인 수는 넣지 않는다"였다)
 */
export const useChatReads = create<ReadsState>()(
  persist(
    (set) => ({
      read: {},
      latest: {},
      noteRoom: (roomId, sequence) =>
        set((s) => {
          const latest = max(s.latest[roomId], sequence);
          const read = s.read[roomId] ?? sequence;
          if (latest === s.latest[roomId] && read === s.read[roomId]) return s;
          return {
            latest: { ...s.latest, [roomId]: latest },
            read: { ...s.read, [roomId]: read },
          };
        }),
      noteMessage: (roomId, sequence, mine) =>
        set((s) => {
          const latest = max(s.latest[roomId], sequence);
          const known = s.read[roomId] ?? sequence - 1;
          const read = mine ? Math.max(known, sequence) : known;
          if (latest === s.latest[roomId] && read === s.read[roomId]) return s;
          return {
            latest: { ...s.latest, [roomId]: latest },
            read: { ...s.read, [roomId]: read },
          };
        }),
      markRead: (roomId, sequence) =>
        set((s) => {
          const latest = max(s.latest[roomId], sequence);
          const read = max(s.read[roomId], sequence);
          if (latest === s.latest[roomId] && read === s.read[roomId]) return s;
          return {
            latest: { ...s.latest, [roomId]: latest },
            read: { ...s.read, [roomId]: read },
          };
        }),
      clearAll: () => set({ read: {}, latest: {} }),
    }),
    { name: 'chat-reads', storage: createJSONStorage(() => createChatStorage('chat-reads')) },
  ),
);

/** 이 방의 안 읽은 수 */
export function useUnread(roomId: string | undefined): number {
  return useChatReads((s) => (roomId ? unreadOf(s.latest[roomId], s.read[roomId]) : 0));
}

/** 모든 방의 안 읽은 수를 더한 값. 채팅 탭 배지에 쓴다 */
export function useTotalUnread(): number {
  return useChatReads((s) =>
    Object.keys(s.latest).reduce((sum, id) => sum + unreadOf(s.latest[id], s.read[id]), 0),
  );
}
