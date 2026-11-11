import { useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useCallback, useRef } from 'react';

import { toApiError } from '@/api/errors';
import { getTrip } from '@/features/trip/api';
import { tripKey } from '@/features/trip/hooks/use-trip';

import { readNotification } from '../api';
import { destinationOf } from '../notification-rules';
import type { NotificationView } from '../types';

import { patchListed, refreshUnread } from './use-notifications';

export type OpenResult = 'opened' | 'gone' | 'none' | 'busy';

/** 이동 뒤 화면이 바뀌는 사이 다시 눌린 것을 막는 시간 */
const SETTLE_MS = 800;

/**
 * 알림 열기. 읽음으로 바꾸고, 여행이 있는 대상이면 그 여행을 받아 본 뒤 대상 화면으로 간다.
 * 여행이 404·403이면 볼 수 없음 화면(Q-12-5). 나간 여행 표시만으로 정하지 않고 늘 여행을 받아 본다. 읽음 요청이 실패해도 이동한다.
 * 빠르게 두 번 눌러도 이동은 한 번
 */
export function useOpenNotification() {
  const queryClient = useQueryClient();
  const busy = useRef(false);

  return useCallback(
    async (n: NotificationView): Promise<OpenResult> => {
      if (busy.current) return 'busy';
      busy.current = true;
      const release = () =>
        setTimeout(() => {
          busy.current = false;
        }, SETTLE_MS);
      try {
        if (n.readAt === null) {
          const at = new Date().toISOString();
          patchListed(queryClient, n.id, (x) => ({ ...x, readAt: at }));
          void readNotification(n.id)
            .catch(() => undefined)
            .finally(() => refreshUnread(queryClient));
        }
        const goGone = (): OpenResult => {
          router.push({ pathname: '/notifications/gone', params: { id: n.id } });
          return 'gone';
        };
        const dest = destinationOf(n);
        if (!dest) return 'none';
        if (dest.tripId) {
          const tripId = dest.tripId;
          try {
            await queryClient.fetchQuery({
              queryKey: tripKey(tripId),
              queryFn: () => getTrip(tripId),
            });
          } catch (e) {
            const status = toApiError(e).status;
            if (status === 404 || status === 403) return goGone();
            // 그 밖의 실패는 대상 화면이 스스로 안내한다
          }
        }
        // 주소를 알림 종류에 따라 글자로 만들어서 타입 있는 주소로 볼 수 없다
        router.push(dest.href as Href);
        return 'opened';
      } finally {
        release();
      }
    },
    [queryClient],
  );
}
