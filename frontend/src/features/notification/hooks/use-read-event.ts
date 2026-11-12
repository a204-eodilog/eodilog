import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { readEvent } from '../api';

import { notificationKeys } from './notification-keys';
import { refreshUnread } from './use-notifications';

/**
 * 같은 소식(eventId)의 내 알림을 읽음으로 바꾼다. 채팅 시스템 카드로 그 소식을 열었을 때 쓴다.
 * 화면 이동을 막지 않게 기다리지 않고, 실패해도 조용히 넘어간다(그 소식의 알림이 나에게 없으면 404).
 * 끝나면 알림 목록과 종 숫자를 새로 받는다
 */
export function useReadEvent() {
  const queryClient = useQueryClient();
  return useCallback(
    (eventId: string) => {
      void readEvent(eventId)
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: notificationKeys.list });
          refreshUnread(queryClient);
        })
        .catch(() => undefined);
    },
    [queryClient],
  );
}
