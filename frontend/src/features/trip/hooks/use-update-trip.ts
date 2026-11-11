import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { toApiError } from '@/api/errors';
import { toast } from '@/components/ui';
import { haptic } from '@/lib/haptics';

import { updateTrip } from '../api';
import {
  buildTripUpdate,
  FAILURE_MESSAGE,
  memberActionFailure,
  mergeAfterConflict,
  TRIP_EDIT_FIELD_LABEL,
} from '../companion-rules';
import type { MemberActionFailure } from '../companion-rules';
import type { UpdateTripBody } from '../types';

import { invalidateTripLists, refreshTripAfterConflict } from './trip-cache';
import { ensureRegions } from './use-region-names';
import { useTripEditDraft } from './use-trip-edit-draft';
import { tripKey } from './use-trip';

export type SaveResult = 'saved' | 'unchanged' | 'failed';

/**
 * S19 [완료]. 수정을 시작한 때의 여행(base)과 비교해 바뀐 칸만 보낸다(research R6).
 * 409면 최신 여행을 다시 받아 칸마다 다시 채우고(mergeAfterConflict) 안내한다. 자동으로 다시 보내지 않는다(R4).
 * 최신 여행이 이미 내 입력과 같으면(응답만 놓친 내 저장 등) 저장된 것으로 본다.
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
      haptic.success();
      return 'saved';
    } catch (e) {
      const kind = memberActionFailure(e);
      setFailure(kind);
      if (kind === 'conflict') {
        const latest = await refreshTripAfterConflict(queryClient, tripId);
        if (!latest) {
          toast.show('다른 동행이 먼저 고쳤어요. 다시 시도해 주세요');
          return 'failed';
        }
        // 칸마다 고른다. 다른 동행이 안 고친 칸은 내 입력을 남겨 다시 입력하지 않게 한다
        const merged = mergeAfterConflict(
          base,
          { title, range, regionIds: regions.map((r) => r.id) },
          latest,
        );
        let nextRegions = regions;
        if (!merged.keptMine.regions) {
          try {
            nextRegions = await ensureRegions(queryClient, latest.destinationRegionIds);
          } catch {
            // 최신 여행지 이름을 못 받았다. 빼고 채우면 다시 저장할 때 그 여행지가 지워지므로 입력을 그대로 둔다.
            // 기준(base)도 그대로라 다시 [완료]하면 또 409를 받아 이 과정을 다시 한다
            toast.show('다른 동행이 먼저 고쳤어요. 다시 시도해 주세요');
            return 'failed';
          }
        }
        useTripEditDraft.setState({
          base: latest,
          title: merged.values.title,
          range: merged.values.range,
          regions: nextRegions,
        });
        if (merged.overlapped.length > 0) {
          const labels = merged.overlapped.map((f) => TRIP_EDIT_FIELD_LABEL[f]).join('·');
          toast.show(`${labels} 칸은 다른 동행이 먼저 바꿨어요. 확인하고 다시 저장해 주세요`);
        } else if (merged.leftToSave) {
          toast.show('다른 동행이 먼저 고쳤어요. 내가 고친 내용은 남겨 뒀으니 다시 저장해 주세요');
        } else {
          // 최신 여행이 이미 내 입력과 같다. 응답만 놓친 내 저장이었거나 같은 값으로 고친 것이다
          setFailure(null);
          haptic.success();
          return 'saved';
        }
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
