import { useCallback, useEffect, useRef, useState } from 'react';

import { toApiError } from '@/api/errors';
import { createIdempotencyKeyStore } from '@/api/idempotency';
import { getAutoCourse, getJob } from '@/features/course/api';
import { JobStopped, waitForJob } from '@/features/course/wait-job';

import { requestWeatherAlternatives, requestWeatherProposal } from '../api';
import type { WeatherAlternativesResult } from '../types';

const WAIT = { interval: 1500, timeout: 120_000 };

type Phase = 'idle' | 'running' | 'done' | 'failed';

/**
 * 날씨 대안 작업과 고른 대안으로 만드는 WEATHER 변경안 작업.
 * 둘 다 1.5초마다 확인하고 2분이 넘으면 실패, 화면을 나가면 멈춘다.
 * 변경안 요청의 Idempotency-Key는 응답 없이 끊겼을 때만 다시 쓰고, 서버가 답했으면 버린다.
 */
export function useWeatherAlternatives(tripId: string) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<WeatherAlternativesResult | null>(null);
  const [proposal, setProposal] = useState<{ phase: Phase; jobId: string | null }>({
    phase: 'idle',
    jobId: null,
  });
  const controller = useRef<AbortController | null>(null);
  const proposalController = useRef<AbortController | null>(null);
  const proposalKeys = useRef(createIdempotencyKeyStore()).current;
  useEffect(
    () => () => {
      controller.current?.abort();
      proposalController.current?.abort();
    },
    [],
  );

  /** 그 날 그 장소의 날씨 대안을 만든다 */
  const start = useCallback(
    async (date: string, placeId: string, expectedVersion: number) => {
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      setPhase('running');
      try {
        const ref = await requestWeatherAlternatives(tripId, { date, placeId, expectedVersion });
        setJobId(ref.jobId);
        const job = await waitForJob(
          (signal) => getJob(ref.jobId, signal),
          (j) => j.status,
          ctrl.signal,
          WAIT,
        );
        if (!job || job.status !== 'SUCCEEDED' || !job.result) {
          setPhase('failed');
          return;
        }
        setResult(job.result as WeatherAlternativesResult);
        setPhase('done');
      } catch (e) {
        if (!(e instanceof JobStopped)) setPhase('failed');
      }
    },
    [tripId],
  );

  /** 고른 대안으로 변경안을 만든다. 끝나면 true */
  const makeProposal = useCallback(
    async (selectedAlternativeId: string): Promise<boolean> => {
      if (!jobId || !result) return false;
      proposalController.current?.abort();
      const ctrl = new AbortController();
      proposalController.current = ctrl;
      setProposal({ phase: 'running', jobId: null });
      try {
        const body = {
          expectedVersion: result.baseVersion,
          sourceWeatherJobId: jobId,
          selectedAlternativeId,
        };
        let ref;
        try {
          ref = await requestWeatherProposal(tripId, body, proposalKeys.keyFor(body));
          proposalKeys.clear();
        } catch (e) {
          if (toApiError(e).status !== null) proposalKeys.clear();
          throw e;
        }
        const done = await waitForJob(
          (signal) => getAutoCourse(tripId, ref.jobId, signal),
          (p) => p.job.status,
          ctrl.signal,
          WAIT,
        );
        const ok = done?.job.status === 'SUCCEEDED';
        setProposal({ phase: ok ? 'done' : 'failed', jobId: ok ? ref.jobId : null });
        return ok;
      } catch (e) {
        if (!(e instanceof JobStopped)) setProposal({ phase: 'failed', jobId: null });
        return false;
      }
    },
    [tripId, jobId, result, proposalKeys],
  );

  /** 변경안 시트를 닫는다 */
  const closeProposal = useCallback(() => setProposal({ phase: 'idle', jobId: null }), []);

  return { phase, result, start, proposal, makeProposal, closeProposal };
}
