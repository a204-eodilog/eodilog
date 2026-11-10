/**
 * 앱 전체 실시간 연결. 채팅이 처음 쓰고 투표·코스·알림도 같은 연결을 쓴다.
 *
 * 경계: src/realtime은 features/*를 불러오지 않는다. 기능은 앱 층(src/app/_layout.tsx)이나 기능 코드에서
 * realtime.subscribe(목적지, { onMessage, onResync })로 붙는다. 목적지는 destinations.ts에 서버와 함께 더한다.
 */
export { realtime } from './instance';
export { useConnectionState, useShowDisconnected } from './connection-store';
export type { ConnectionState } from './connection-machine';
export type { RealtimeHandlers } from './realtime-client';
export { useRealtimeLifecycle } from './use-realtime-lifecycle';
