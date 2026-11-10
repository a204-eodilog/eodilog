import { Client, type IStompSocket } from '@stomp/stompjs';

import type { StompCallbacks, StompLike } from './realtime-client';

/** 서버와 주고받는 하트비트 간격. 서버도 10초로 맞춘다(api-spec §9) */
export const HEARTBEAT_MS = 10_000;

type Options = {
  brokerURL: string;
  /** 테스트에서 가짜 소켓을 넣는다 */
  webSocketFactory?: () => IStompSocket;
  debug?: (message: string) => void;
};

/** 실제 STOMP 클라이언트. 설정을 여기 한 곳에 두고 테스트에서 그대로 확인한다 */
export function createStompClient(callbacks: StompCallbacks, options: Options): StompLike {
  const client = new Client({
    brokerURL: options.brokerURL,
    ...(options.webSocketFactory ? { webSocketFactory: options.webSocketFactory } : {}),
    ...(options.debug ? { debug: options.debug } : {}),
    // RN의 WebSocket은 텍스트 프레임 끝 NUL을 잃을 수 있어 이진 프레임으로 보내고, 받을 때 NUL을 채운다
    forceBinaryWSFrames: true,
    appendMissingNULLonIncoming: true,
    heartbeatIncoming: HEARTBEAT_MS,
    heartbeatOutgoing: HEARTBEAT_MS,
    // 반쯤 끊긴 연결(와이파이→LTE 전환·공유기가 몰래 끊음): 하트비트가 끊기면 close()를 부르는데, 상대가 답하지 않으면
    // 닫힘 신호가 한참 오지 않아 앱이 계속 "연결됨"으로 알았다(재현: 120초 동안 못 알아챔). 닫힘을 기다리지 않고
    // 소켓을 바로 버려 끊김으로 처리한다 → realtime-client가 다시 연결하고 놓친 메시지를 이어 받는다(2026-11-06)
    discardWebsocketOnCommFailure: true,
    // 다시 연결은 realtime-client가 정한다
    reconnectDelay: 0,
    beforeConnect: (c) => {
      c.connectHeaders = callbacks.connectHeaders();
    },
    onConnect: () => callbacks.onConnect(),
    onStompError: (frame) => callbacks.onStompError(frame.headers.message),
    onWebSocketClose: () => callbacks.onWebSocketClose(),
  });
  return client;
}
