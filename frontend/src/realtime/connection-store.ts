import { useEffect, useState } from 'react';
import { create } from 'zustand';

import {
  DISCONNECTED_NOTICE_MS,
  IDLE,
  nextConnection,
  showDisconnected,
  type ConnectionEvent,
  type ConnectionState,
} from './connection-machine';

type ConnectionStore = {
  state: ConnectionState;
  dispatch: (event: ConnectionEvent) => void;
};

/** 화면이 읽는 연결 상태. 바꾸는 쪽은 realtime-client 하나다 */
export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  state: IDLE,
  dispatch: (event) => {
    const next = nextConnection(get().state, event);
    if (next !== get().state) set({ state: next });
  },
}));

export function useConnectionState(): ConnectionState {
  return useConnectionStore((s) => s.state);
}

/**
 * S46·S47 위 끊김 안내를 보일지. 끊긴 지 3초가 지나는 순간 다시 그리도록 그때만 타이머를 건다.
 * 연결돼 있거나 이미 안내 중이면 타이머가 없다
 */
export function useShowDisconnected(): boolean {
  const state = useConnectionState();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state.kind !== 'reconnecting') return;
    const remaining = state.since + DISCONNECTED_NOTICE_MS - Date.now();
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [state]);

  return showDisconnected(state, now);
}
