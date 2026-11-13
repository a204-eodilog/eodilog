import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';

import { toApiError } from '@/api/errors';

import { getVoiceJob, submitVoiceDraft } from '../api';
import { type VoiceFailure, failureFromJobCode, failureFromSubmit } from '../voice-rules';

/** 작업 상태를 묻는 간격 */
export const VOICE_POLL_MS = 1500;
/** 이보다 오래 걸리면 멈춘다. AI 처리 예산 45초 + 대기·업로드 여유 */
export const VOICE_TIMEOUT_MS = 90_000;
/** 상태 확인이 연속으로 이만큼 끊기면 실패로 본다 */
const POLL_ERROR_LIMIT = 3;

export const voiceDraftKey = (jobId: string) => ['voice-expense', jobId] as const;

/** sending 보내는 중 / waiting 접수했고 차례를 기다림 / working 말을 지출로 정리하는 중 */
export type AnalysisStep = 'sending' | 'waiting' | 'working';

export type AnalysisState =
  | { phase: 'idle' }
  | { phase: 'analyzing'; step: AnalysisStep }
  | { phase: 'failed'; failure: VoiceFailure }
  | { phase: 'done'; jobId: string };

class Stopped extends Error {}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Stopped());
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Stopped());
    });
  });
}

/**
 * 녹음을 보내고 분석이 끝날 때까지 기다린다. 결과는 쿼리 캐시(voiceDraftKey)에 넣고 jobId를 돌려준다.
 * 접수 응답을 받기 전에 끊기면 다음 보내기에 같은 Idempotency-Key를 써서 작업이 하나만 생긴다.
 * 접수된 작업이 실패한 뒤 다시 보내면 새 키로 새 작업을 만든다(서버는 자동 재시도하지 않는다).
 * 화면을 떠나거나 reset()하면 기다림만 멈춘다(서버 작업 취소는 아니다).
 */
export function useVoiceAnalysis(tripId: string) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AnalysisState>({ phase: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const pendingKey = useRef<string | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    pendingKey.current = null;
    setState({ phase: 'idle' });
  }, []);

  const send = useCallback(
    async (uri: string): Promise<string | null> => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const { signal } = abort;
      setState({ phase: 'analyzing', step: 'sending' });

      const key = pendingKey.current ?? randomUUID();
      pendingKey.current = key;
      let jobId: string;
      try {
        jobId = (await submitVoiceDraft(tripId, uri, key, signal)).jobId;
      } catch (e) {
        if (signal.aborted) return null;
        const error = toApiError(e);
        // 서버가 답했으면 그 키는 끝났다. 답을 못 받았으면 다시 보낼 때 같은 키를 쓴다
        if (error.kind === 'http') pendingKey.current = null;
        setState({ phase: 'failed', failure: failureFromSubmit(error) });
        return null;
      }
      pendingKey.current = null;
      setState({ phase: 'analyzing', step: 'waiting' });

      const deadline = Date.now() + VOICE_TIMEOUT_MS;
      let errors = 0;
      try {
        for (;;) {
          await wait(VOICE_POLL_MS, signal);
          if (Date.now() >= deadline) {
            setState({ phase: 'failed', failure: 'timeout' });
            return null;
          }
          let job;
          try {
            job = await getVoiceJob(jobId, signal);
            errors = 0;
          } catch (e) {
            if (signal.aborted) throw new Stopped();
            const error = toApiError(e);
            if (error.kind === 'http' && error.status === 404) {
              setState({ phase: 'failed', failure: 'interrupted' });
              return null;
            }
            errors += 1;
            if (errors >= POLL_ERROR_LIMIT) {
              setState({ phase: 'failed', failure: 'provider' });
              return null;
            }
            continue;
          }
          if (job.status === 'QUEUED') setState({ phase: 'analyzing', step: 'waiting' });
          else if (job.status === 'RUNNING') setState({ phase: 'analyzing', step: 'working' });
          else if (job.status === 'SUCCEEDED' && job.result) {
            queryClient.setQueryData(voiceDraftKey(job.id), job.result);
            setState({ phase: 'done', jobId: job.id });
            return job.id;
          } else {
            setState({
              phase: 'failed',
              failure:
                job.status === 'CANCELLED' ? 'interrupted' : failureFromJobCode(job.error?.code),
            });
            return null;
          }
        }
      } catch (e) {
        if (e instanceof Stopped || signal.aborted) return null;
        setState({ phase: 'failed', failure: 'provider' });
        return null;
      }
    },
    [queryClient, tripId],
  );

  return { state, send, reset };
}
