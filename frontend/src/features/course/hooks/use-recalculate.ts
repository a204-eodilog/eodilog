import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { API_ERROR, toApiError } from '@/api/errors';
import { toast } from '@/components/ui';

import { getJob, recalculateRoutes } from '../api';
import { hasUnavailable } from '../course-rules';
import { markRouteAttempt, routeAttempted } from '../route-attempts';
import type { Itinerary } from '../types';
import { JobStopped, waitForJob } from '../wait-job';

import { itineraryKey } from './course-keys';

export const RECALC_POLL_MS = 1500;
/** 서버는 한 번에 60초까지, 30초 쉬고 세 번까지 다시 한다. 그동안 먼저 포기하지 않게 넉넉히 기다린다 */
export const RECALC_TIMEOUT_MS = 4 * 60_000;

type StartOptions = {
  /** 화면이 스스로 요청한 계산. 사용자가 누른 것이 아니라 결과 안내를 띄우지 않는다 */
  silent?: boolean;
};

/**
 * 저장된 코스의 이동 시간 계산(POST routes/recalculate → 작업 기다림 → 코스 다시 받기).
 * 서버는 시간이 없는 구간만 구하고, 못 구한 구간은 그대로 둔 채 작업을 성공으로 끝낸다.
 * 그래서 작업 결과와 따로, 다시 받은 코스에 시간 없는 구간이 남았는지도 본다.
 * 409면 코스가 바뀐 것이라 코스를 다시 받고 다시 눌러 달라고 한다.
 */
export function useRecalculate(tripId: string) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  // 요청해 본 코스의 기억은 화면 바깥(route-attempts)에 있다. 적을 때마다 이 값을 바꿔 화면을 다시 그린다.
  // 요청이 곧바로 실패하면 busy가 켜졌다 바로 꺼져 다시 그려지지 않을 수 있어서다
  const [, setAttempts] = useState(0);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function start(expectedVersion: number, { silent = false }: StartOptions = {}) {
    if (running.current) return;
    running.current = true;
    const abort = new AbortController();
    controller.current = abort;
    // 요청하기 전에 적어 둔다. 화면을 나갔다 와도 같은 코스에 또 요청하지 않는다
    markRouteAttempt(tripId, expectedVersion);
    setAttempts((n) => n + 1);
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
      if (silent) return;
      if (job?.status !== 'SUCCEEDED') {
        toast.error('이동 시간을 다시 구하지 못했어요');
        return;
      }
      const latest = queryClient.getQueryData<Itinerary>(itineraryKey(tripId));
      if (latest && hasUnavailable(latest)) toast.show('이동 시간을 구하지 못한 구간이 있어요');
    } catch (e) {
      if (e instanceof JobStopped || abort.signal.aborted) return;
      if (toApiError(e).code === API_ERROR.VERSION_CONFLICT) {
        await queryClient.invalidateQueries({ queryKey: itineraryKey(tripId) });
        if (!silent) toast.show('코스가 바뀌었어요. 최신 코스로 다시 눌러 주세요');
      } else if (!silent) {
        toast.error('이동 시간을 다시 구하지 못했어요');
      }
    } finally {
      running.current = false;
      if (!abort.signal.aborted) setBusy(false);
    }
  }

  /** 이 버전의 코스에 계산을 요청해 본 적이 있는지 */
  const attempted = (version: number) => routeAttempted(tripId, version);

  return { start, busy, attempted };
}
