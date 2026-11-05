import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { toApiError } from '@/api/errors';
import { toast } from '@/components/ui';

import { updateTrip } from '../api';
import { buildTripUpdate, FAILURE_MESSAGE, memberActionFailure } from '../companion-rules';
import type { MemberActionFailure } from '../companion-rules';
import type { UpdateTripBody } from '../types';

import { invalidateTripLists, refreshTripAfterConflict } from './trip-cache';
import { ensureRegions } from './use-region-names';
import { useTripEditDraft } from './use-trip-edit-draft';
import { tripKey } from './use-trip';

export type SaveResult = 'saved' | 'unchanged' | 'failed';

/**
 * S19 [완료]. 수정을 시작한 때의 여행(base)과 비교해 바뀐 칸만 보낸다(research R6).
 * 409면 최신 여행을 다시 받아 입력 칸을 다시 채우고 안내한다. 자동으로 다시 보내지 않는다(R4).
 */
export function useUpdateTrip(tripId: string) {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<MemberActionFailure | null>(null);
  /** 서버가 이름을 받지 않았을 때 이름 칸 아래 안내 */
  const [titleError, setTitleError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: UpdateTripBody) => updateTrip(tripId, body),
    onSuccess: (trip) => {
      queryClient.setQueryData(tripKey(tripId), trip);
      invalidateTripLists(queryClient);
    },
  });

  const save = async (): Promise<SaveResult> => {
    const { base, title, range, regions } = useTripEditDraft.getState();
    if (!base) return 'unchanged';
    const body = buildTripUpdate(base, { title, range, regionIds: regions.map((r) => r.id) });
    if (!body) return 'unchanged';

    setFailure(null);
    setTitleError(null);
    try {
      await mutation.mutateAsync(body);
      return 'saved';
    } catch (e) {
      const kind = memberActionFailure(e);
      setFailure(kind);
      if (kind === 'conflict') {
        const latest = await refreshTripAfterConflict(queryClient, tripId);
        if (latest) {
          const latestRegions = await ensureRegions(queryClient, latest.destinationRegionIds);
          useTripEditDraft.getState().fill(latest, latestRegions);
        }
        toast.show('다른 동행이 먼저 고쳤어요. 최신 내용을 보여 드릴게요');
      } else if (kind === 'error') {
        const fieldMessage = toApiError(e).fields.title;
        if (fieldMessage) setTitleError(fieldMessage);
      } else if (kind !== 'tripGone') {
        toast.show(FAILURE_MESSAGE[kind]);
      }
      return 'failed';
    }
  };

  return {
    save,
    isPending: mutation.isPending,
    /** conflict는 이미 최신 값으로 다시 채웠으므로 화면에 오류 띠를 남기지 않는다 */
    failure: failure === 'conflict' ? null : failure,
    titleError,
    clearTitleError: () => setTitleError(null),
  };
}
