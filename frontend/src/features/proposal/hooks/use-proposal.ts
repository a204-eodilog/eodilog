import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { API_ERROR, toApiError } from '@/api/errors';
import { getAutoCourse, getItinerary } from '@/features/course/api';
import { itineraryKey } from '@/features/course/hooks/course-keys';
import type { ItineraryProposal } from '@/features/course/types';
import { JobStopped, waitForJob } from '@/features/course/wait-job';

import { applyProposal, requestRemoval } from '../api';

const WAIT = { interval: 1500, timeout: 120_000 };

/** S29를 연 이유. 날씨 대안이 만든 작업이거나, 화면이 만들 장소 빼기 */
export type ProposalSource = { jobId: string } | { removePlaceId: string };

export type ApplyResult = 'applied' | 'conflict' | 'unschedulable' | 'failed' | 'busy';

/**
 * 변경안 작업을 기다리고 적용한다. 장소 빼기는 지금 코스 version으로 작업을 먼저 만든다.
 * 적용은 한 번 누른 것이 끝나기 전에는 다시 보내지 않는다. 화면을 나가면 기다리기를 멈춘다.
 */
export function useProposal(tripId: string, source: ProposalSource) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [proposal, setProposal] = useState<ItineraryProposal | null>(null);
  const [jobId, setJobId] = useState<string | null>('jobId' in source ? source.jobId : null);
  const [applying, setApplying] = useState(false);
  const sending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const removePlaceId = 'removePlaceId' in source ? source.removePlaceId : null;
  const givenJobId = 'jobId' in source ? source.jobId : null;

  const start = useCallback(async () => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setPhase('running');
    setProposal(null);
    try {
      let id = givenJobId;
      if (removePlaceId) {
        const current = await queryClient.fetchQuery({
          queryKey: itineraryKey(tripId),
          queryFn: () => getItinerary(tripId),
          staleTime: 0,
        });
        id = (await requestRemoval(tripId, current.version, removePlaceId)).jobId;
      }
      if (!id) throw new Error('no job');
      setJobId(id);
      const jobKey = id;
      const done = await waitForJob(
        (signal) => getAutoCourse(tripId, jobKey, signal),
        (p) => p.job.status,
        ctrl.signal,
        WAIT,
      );
      if (!done || done.job.status !== 'SUCCEEDED' || !done.proposed) {
        setPhase('failed');
        return;
      }
      setProposal(done);
      setPhase('done');
    } catch (e) {
      if (!(e instanceof JobStopped)) setPhase('failed');
    }
  }, [queryClient, tripId, givenJobId, removePlaceId]);

  /** 변경안을 지금 코스로. 끝나면 코스 캐시를 바꾼다 */
  const apply = useCallback(async (): Promise<ApplyResult> => {
    if (!proposal || !jobId) return 'failed';
    if (sending.current) return 'busy';
    sending.current = true;
    setApplying(true);
    try {
      const itinerary = await applyProposal(tripId, jobId, proposal.baseVersion);
      queryClient.setQueryData(itineraryKey(tripId), itinerary);
      return 'applied';
    } catch (e) {
      const { code } = toApiError(e);
      if (code === API_ERROR.VERSION_CONFLICT) return 'conflict';
      if (code === API_ERROR.UNSCHEDULABLE_ALTERNATIVE) return 'unschedulable';
      return 'failed';
    } finally {
      sending.current = false;
      setApplying(false);
    }
  }, [queryClient, tripId, proposal, jobId]);

  return { phase, proposal, jobId, start, apply, applying, canRecreate: removePlaceId !== null };
}
