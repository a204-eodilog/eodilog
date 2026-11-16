import { refreshAccessToken } from '@/api/session';
import { env } from '@/config/env';
import { useSessionStore } from '@/stores/session-store';

import { useConnectionStore } from './connection-store';
import { createDevStomp, devRealtime } from './dev-transport';
import { createRealtimeClient, type StompCallbacks, type StompLike } from './realtime-client';
import { createStompClient } from './stomp-client';
import { tokenExpiresAt } from './token-expiry';
import { wsUrl } from './ws-url';

/** 앱에 하나뿐인 실시간 연결 인스턴스. 바깥에서는 index.ts로 가져다 쓴다 */

function createRealStomp(callbacks: StompCallbacks): StompLike {
  return createStompClient(callbacks, { brokerURL: wsUrl(env.apiBaseUrl) });
}

function log(message: string) {
  if (__DEV__) console.log(message);
}

// stompjs는 프레임을 해석할 때 TextEncoder·TextDecoder를 쓴다. 없으면 실시간 연결이 실패한다(research R2)
if (__DEV__ && !env.devMock && typeof TextDecoder === 'undefined') {
  console.warn('[realtime] TextDecoder가 없어 실시간 연결이 실패할 수 있다. 폴리필이 필요하다');
}

export const realtime = createRealtimeClient({
  createStomp: env.devMock ? createDevStomp : createRealStomp,
  getAccessToken: () => useSessionStore.getState().accessToken,
  refreshAccessToken,
  getTokenExpiresAt: () => tokenExpiresAt(useSessionStore.getState().accessToken),
  connection: {
    get: () => useConnectionStore.getState().state,
    dispatch: (event) => useConnectionStore.getState().dispatch(event),
  },
  log,
});

if (env.devMock) devRealtime.setRestoreHandler(() => realtime.retryNow());
