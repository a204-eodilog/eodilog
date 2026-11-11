import { onlineManager } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * 당겨서 새로고침 표시. 사람이 당겼을 때만 켜고, 다시 받기가 끝나면 끈다.
 * 쿼리의 isRefetching을 그대로 쓰면 앱 복귀·다시 연결처럼 조용히 다시 받을 때도 화면 위 동그라미가 돈다.
 * 연결이 끊기면 다시 받기는 실패하지 않고 연결될 때까지 멈춘다(TanStack 네트워크 모드 online). 그래서 기다리면
 * 동그라미가 계속 돌았다(2026-11-10 점검). 끊겼으면 기다리지 않고 끈다. 멈춘 다시 받기는 연결되면 저절로 이어진다
 */
export function usePullRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    let unsubscribe = () => {};
    // 이미 끊겼거나, 기다리는 사이 끊기면 끝난다
    const offline = new Promise<void>((resolve) => {
      if (!onlineManager.isOnline()) return resolve();
      unsubscribe = onlineManager.subscribe((online) => {
        if (!online) resolve();
      });
    });
    try {
      await Promise.race([refetch(), offline]);
    } finally {
      unsubscribe();
      setRefreshing(false);
    }
  };
  return { refreshing, onRefresh };
}
