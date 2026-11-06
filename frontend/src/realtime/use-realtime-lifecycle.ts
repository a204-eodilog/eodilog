import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useSessionStore } from '@/stores/session-store';

import { realtime } from './instance';

/**
 * 로그인·앱 앞뒤 전환·네트워크에 맞춰 실시간 연결을 켜고 끈다. 앱 루트에서 한 번 부른다.
 * 로그아웃 때 연결을 멈추는 곳은 여기 하나다. 세션 저장소가 이 모듈을 불러오면 순환 import가 되므로
 * clearSession에서는 연결을 건드리지 않는다(research R15)
 */
export function useRealtimeLifecycle() {
  const signedIn = useSessionStore((s) => s.status === 'signedIn');

  useEffect(() => {
    if (!signedIn) return;
    realtime.start();
    return () => realtime.stop();
  }, [signedIn]);

  useEffect(() => {
    // 화면이 보이는 동안은 연결을 유지한다(FR-018). iOS의 inactive(공유 창·권한 창)에는 끊지 않는다
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') realtime.resume();
      else if (state === 'background') realtime.pause();
    });
    return () => sub.remove();
  }, []);

  // 앱 시작 직후에는 isConnected가 null일 수 있다. false일 때만 끊김으로 본다(src/api/query-focus.ts와 같다).
  // 인터넷은 계속 있는데 네트워크가 바뀌면(와이파이↔LTE, 다른 와이파이) 옛 소켓이 반쯤 끊긴 채 남을 수 있어 새로 붙는다
  useEffect(() => {
    let last: string | null = null;
    return NetInfo.addEventListener((state) => {
      const online = state.isConnected !== false;
      realtime.setOnline(online);
      const key = online ? networkKey(state) : null;
      if (key && last && key !== last) realtime.networkChanged();
      if (key) last = key;
    });
  }, []);
}

/** 지금 붙어 있는 네트워크를 가리키는 값. 종류(와이파이·LTE)와 알 수 있으면 IP까지 본다 */
export function networkKey(state: Pick<NetInfoState, 'type' | 'details'>): string {
  const details = state.details as { ipAddress?: string | null } | null;
  return `${state.type}:${details?.ipAddress ?? ''}`;
}
