import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

import { API_ERROR, toApiError } from '@/api/errors';
import { toast } from '@/components/ui';
import { getItinerary } from '@/features/course/api';
import { itineraryKey } from '@/features/course/hooks/course-keys';

import { undoApply } from '../api';

export type UndoResult = 'undone' | 'unavailable' | 'failed' | 'busy';

/**
 * 직전 적용을 한 번 되돌린다. 지금 코스 version으로 보내고, 그 사이 다른 쓰기가 있으면
 * 409 UNDO_UNAVAILABLE을 안내한다(Q-11-4). 두 번 눌러도 한 번만 보낸다.
 */
export function useUndo(tripId: string) {
  const queryClient = useQueryClient();
  const sending = useRef(false);

  return useCallback(
    async (appliedJobId: string): Promise<UndoResult> => {
      if (sending.current) return 'busy';
      sending.current = true;
      try {
        const current = await queryClient.fetchQuery({
          queryKey: itineraryKey(tripId),
          queryFn: () => getItinerary(tripId),
        });
        const restored = await undoApply(tripId, current.version, appliedJobId);
        queryClient.setQueryData(itineraryKey(tripId), restored);
        toast.success('되돌렸어요');
        return 'undone';
      } catch (e) {
        if (toApiError(e).code === API_ERROR.UNDO_UNAVAILABLE) {
          toast.show('그 사이 코스가 바뀌어 되돌릴 수 없어요');
          return 'unavailable';
        }
        toast.error('되돌리지 못했어요. 다시 시도해 주세요');
        return 'failed';
      } finally {
        sending.current = false;
      }
    },
    [queryClient, tripId],
  );
}
