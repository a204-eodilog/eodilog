import { create } from 'zustand';

type BlockedState = {
  /** 볼 수 없다고 답을 받은 여행. 화면이 다시 요청하지 않게 막는다 */
  trips: Record<string, true>;
  block: (tripId: string) => void;
  /** 다시 참여해 대화방 목록에 그 방이 다시 나타났다 */
  unblock: (tripIds: string[]) => void;
  clearAll: () => void;
};

/**
 * 차단된 대화방 표시(research R10). 캐시를 지운 뒤 아직 떠 있는 S47이 같은 요청을 다시 보내 404를 되풀이하지 않게
 * 이 표시가 있으면 방·메시지 요청을 끈다. 앱을 다시 켜면 사라진다
 */
export const useChatBlocked = create<BlockedState>((set, get) => ({
  trips: {},
  block: (tripId) => {
    if (get().trips[tripId]) return;
    set((s) => ({ trips: { ...s.trips, [tripId]: true } }));
  },
  unblock: (tripIds) => {
    const current = get().trips;
    if (!tripIds.some((id) => current[id])) return;
    const next = { ...current };
    for (const id of tripIds) delete next[id];
    set({ trips: next });
  },
  clearAll: () => set({ trips: {} }),
}));

export function useIsChatBlocked(tripId: string): boolean {
  return useChatBlocked((s) => !!s.trips[tripId]);
}
