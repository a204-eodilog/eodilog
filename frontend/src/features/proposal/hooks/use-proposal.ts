import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { API_ERROR, toApiError } from '@/api/errors';
import { createIdempotencyKeyStore } from '@/api/idempotency';
import { getAutoCourse, getItinerary } from '@/features/course/api';
import { itineraryKey } from '@/features/course/hooks/course-keys';
import type { ItineraryProposal } from '@/features/course/types';
import { JobStopped, waitForJob } from '@/features/course/wait-job';

import { applyProposal, requestRemoval } from '../api';

/**
 * 1.5초마다 확인하고 4분이 넘으면 실패. AI가 잠깐 실패하면 백엔드가 다시 시도해 1~3분 걸릴 수 있다
 * (백엔드 안내 2026-11-09). 그 사이 작업은 QUEUED로 남으므로 백엔드보다 먼저 실패로 끝내지 않는다
 */
const WAIT = { interval: 1500, timeout: 4 * 60_000 };

/** S29를 연 이유. 날씨 대안이 만든 작업이거나, 화면이 만들 장소 빼기 */
export type ProposalSource = { jobId: string } | { removePlaceId: string };

export type ApplyResult =
  | 'applied'
  | 'conflict'
  | 'unschedulable'
  /** 이미 적용한 변경안이다(409 ALREADY_APPLIED) */
  | 'alreadyApplied'
  /** 작업이 아직 끝나지 않았다(409 PROPOSAL_NOT_READY) */
  | 'notReady'
  /** 변경안을 찾을 수 없다(404 JOB_NOT_FOUND) */
  | 'gone'
  | 'failed'
  | 'busy';

/**
 * 변경안 작업을 기다리고 적용한다. 장소 빼기는 지금 코스 version으로 작업을 먼저 만든다.
 * 적용은 한 번 누른 것이 끝나기 전에는 다시 보내지 않는다. 화면을 나가면 기다리기를 멈춘다.
 * 장소 빼기 요청의 Idempotency-Key는 응답 없이 끊겼을 때만 다시 쓰고, 서버가 답했으면 버린다.
 */
export function useProposal(tripId: string, source: ProposalSource) {
  const queryClient = useQueryClient();
  /** unsupported: 서버가 장소 빼기 변경안을 아직 받지 않는다. 다시 시도해도 같다 */
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'failed' | 'unsupported'>(
    'idle',
  );
  const [proposal, setProposal] = useState<ItineraryProposal | null>(null);
  const [jobId, setJobId] = useState<string | null>('jobId' in source ? source.jobId : null);
  const [applying, setApplying] = useState(false);
  const sending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const removalKeys = useRef(createIdempotencyKeyStore()).current;
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
        const key = removalKeys.keyFor({ version: current.version, removePlaceId });
        try {
          id = (await requestRemoval(tripId, current.version, removePlaceId, key)).jobId;
          removalKeys.clear();
        } catch (e) {
          if (toApiError(e).status !== null) removalKeys.clear();
          throw e;
        }
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
      if (e instanceof JobStopped) return;
      // 지금 백엔드는 reason INITIAL만 받아 장소 빼기를 400 VALIDATION_ERROR reason 칸으로 거절한다
      const error = toApiError(e);
      const rejected =
        removePlaceId !== null &&
        error.status === 400 &&
        (error.fields.reason !== undefined || error.fields.excludedPlaceIds !== undefined);
      setPhase(rejected ? 'unsupported' : 'failed');
    }
  }, [queryClient, tripId, givenJobId, removePlaceId, removalKeys]);

  /** 변경안을 지금 코스로. 끝나면 코스 캐시를 바꾼다 */
  const apply = useCallback(async (): Promise<ApplyResult> => {
    if (!proposal || !jobId) return 'failed';
    if (proposal.appliedAt) return 'alreadyApplied';
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
      if (code === 'ALREADY_APPLIED') return 'alreadyApplied';
      if (code === 'PROPOSAL_NOT_READY') return 'notReady';
      if (code === 'JOB_NOT_FOUND') return 'gone';
      return 'failed';
    } finally {
      sending.current = false;
      setApplying(false);
    }
  }, [queryClient, tripId, proposal, jobId]);

  return { phase, proposal, jobId, start, apply, applying, canRecreate: removePlaceId !== null };
}
