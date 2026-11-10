import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { API_ERROR, toApiError } from '@/api/errors';
import { toast } from '@/components/ui';

import { getJob, recalculateRoutes } from '../api';
import { JobStopped, waitForJob } from '../wait-job';

import { itineraryKey } from './course-keys';

export const RECALC_POLL_MS = 1500;
export const RECALC_TIMEOUT_MS = 60_000;

/**
 * 저장된 코스의 이동 시간 다시 계산(POST routes/recalculate → 작업 기다림 → 코스 다시 받기).
 * 백엔드에 아직 없어 실서버에서는 실패 안내가 보인다(가정 Q-6-5).
 * 409면 코스가 바뀐 것이라 코스를 다시 받고 다시 눌러 달라고 한다.
 */
export function useRecalculate(tripId: string) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function start(expectedVersion: number) {
    if (running.current) return;
    running.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const ref = await recalculateRoutes(tripId, expectedVersion);
      const job = await waitForJob(
        (signal) => getJob(ref.jobId, signal),
        (j) => j.status,
        abort.signal,
        { interval: RECALC_POLL_MS, timeout: RECALC_TIMEOUT_MS },
      );
      await queryClient.invalidateQueries({ queryKey: itineraryKey(tripId) });
      if (job?.status !== 'SUCCEEDED') toast.error('이동 시간을 다시 구하지 못했어요');
    } catch (e) {
      if (e instanceof JobStopped || abort.signal.aborted) return;
      if (toApiError(e).code === API_ERROR.VERSION_CONFLICT) {
        await queryClient.invalidateQueries({ queryKey: itineraryKey(tripId) });
        toast.show('코스가 바뀌었어요. 최신 코스로 다시 눌러 주세요');
      } else {
        toast.error('이동 시간을 다시 구하지 못했어요');
      }
    } finally {
      running.current = false;
      if (!abort.signal.aborted) setBusy(false);
    }
  }

  return { start, busy };
}
