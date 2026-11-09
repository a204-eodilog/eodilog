import { useEffect, useRef } from 'react';

// 연결 상태만 읽는다. 실시간 클라이언트를 만드는 '@/realtime' 입구는 거치지 않는다
import { useConnectionState } from '@/realtime/connection-store';

/**
 * 공유 실시간 연결이 끊겼다가(다시 연결 중, 백그라운드, 인증으로 멈춤) 다시 연결되는 순간에만 부른다.
 * 앱을 켜고 처음 연결될 때는 부르지 않는다. 코스 실시간 이벤트가 없어(Q-8-1) 끊긴 동안 놓친 변경을 다시 받는 데 쓴다.
 */
export function useReconnected(onReconnect: () => void) {
  const state = useConnectionState();
  const dropped = useRef(false);
  const callback = useRef(onReconnect);
  useEffect(() => {
    callback.current = onReconnect;
  });
  useEffect(() => {
    if (state.kind === 'reconnecting' || state.kind === 'paused' || state.kind === 'stopped') {
      dropped.current = true;
    } else if (state.kind === 'connected' && dropped.current) {
      dropped.current = false;
      callback.current();
    }
  }, [state]);
}
