/**
 * 실시간 연결 상태 전이(research R4, data-model "연결 상태"). 화면 안내와 다시 연결 간격을 여기서 정한다.
 * 순수 함수라 "끊김 → 3초 → 안내", "백그라운드면 안내 없음" 같은 규칙을 단위 테스트로 증명한다
 */

export type StopReason = 'auth' | 'profile' | 'forbidden';

export type ConnectionState =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected' }
  /** since: 처음 끊긴 시각(ms). 다시 시도해도 바뀌지 않는다 */
  | { kind: 'reconnecting'; attempt: number; since: number }
  /** 앱이 백그라운드라 일부러 끊었다 */
  | { kind: 'paused' }
  /** 인증 문제로 멈췄다. 앱이 다시 앞으로 오면 다시 시도한다 */
  | { kind: 'stopped'; reason: StopReason };

export type ConnectionEvent =
  | { type: 'start' }
  | { type: 'connected' }
  | { type: 'dropped'; at: number }
  | { type: 'authFailed'; reason: StopReason }
  | { type: 'background' }
  | { type: 'foreground' }
  | { type: 'online' }
  | { type: 'signOut' };

/** 끊긴 뒤 이 시간이 지나도 다시 연결되지 않으면 화면에 알린다(정한 값, quickstart에서 기기로 확인) */
export const DISCONNECTED_NOTICE_MS = 3000;

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];

export const IDLE: ConnectionState = { kind: 'idle' };

export function nextConnection(state: ConnectionState, event: ConnectionEvent): ConnectionState {
  if (event.type === 'signOut') return IDLE;
  switch (event.type) {
    case 'start':
      return state.kind === 'idle' || state.kind === 'stopped' ? { kind: 'connecting' } : state;
    case 'connected':
      return state.kind === 'idle' || state.kind === 'paused' ? state : { kind: 'connected' };
    case 'dropped':
      if (state.kind === 'connected' || state.kind === 'connecting') {
        return { kind: 'reconnecting', attempt: 1, since: event.at };
      }
      if (state.kind === 'reconnecting') {
        return { kind: 'reconnecting', attempt: state.attempt + 1, since: state.since };
      }
      return state;
    case 'authFailed':
      return state.kind === 'idle' ? state : { kind: 'stopped', reason: event.reason };
    case 'background':
      return state.kind === 'idle' ? state : { kind: 'paused' };
    case 'foreground':
      return state.kind === 'paused' || state.kind === 'stopped' ? { kind: 'connecting' } : state;
    case 'online':
      // 상태는 그대로다. 다시 연결 중이면 클라이언트가 기다리지 않고 바로 시도한다
      return state;
  }
}

/** 다시 시도 간격. 1·2·4·8·16초, 그 뒤로는 30초마다 */
export function reconnectDelay(attempt: number): number {
  const index = Math.min(Math.max(attempt, 1), RECONNECT_DELAYS_MS.length) - 1;
  return RECONNECT_DELAYS_MS[index];
}

/** 끊김 안내를 보일지. 아주 잠깐의 끊김과 백그라운드에는 띄우지 않는다 */
export function showDisconnected(state: ConnectionState, now: number): boolean {
  if (state.kind === 'stopped') return true;
  if (state.kind === 'reconnecting') return now - state.since >= DISCONNECTED_NOTICE_MS;
  return false;
}
