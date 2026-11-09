import { useCallback, useEffect, useRef, useState } from 'react';

import { getRecommendation, requestRecommendation } from '../api';
import { POLL_MS, TIMEOUT_MS } from '../recommend-rules';
import type { RecommendationResult } from '../types';

export type RecommendationState = {
  /** idle: 아직 안 함 / running: 만드는 중 / done: 끝남(성공·자료 부족) / failed: 실패·취소·2분 넘김·요청 오류 */
  phase: 'idle' | 'running' | 'done' | 'failed';
  /** 마지막으로 받은 결과. 만드는 중에는 진행률만 들어 있다 */
  result: RecommendationResult | null;
  /** 이번 작업을 시작한 시각(ms). 생성 중 단계를 넘기는 데 쓴다 */
  startedAt: number | null;
};

const IDLE: RecommendationState = { phase: 'idle', result: null, startedAt: null };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 추천 작업을 만들고 끝날 때까지 1.5초마다 확인한다. 2분이 넘으면 실패.
 * 다시 시작하면 이전 작업은 더 확인하지 않고, 화면을 나가면 멈춘다.
 */
export function useRecommendation(tripId: string) {
  const [state, setState] = useState<RecommendationState>(IDLE);
  /** 지금 기다리는 작업 번호. 바뀌면 이전 반복은 멈춘다 */
  const run = useRef(0);
  useEffect(
    () => () => {
      run.current += 1;
    },
    [],
  );

  const start = useCallback(async () => {
    run.current += 1;
    const mine = run.current;
    const startedAt = Date.now();
    const alive = () => run.current === mine;
    setState({ phase: 'running', result: null, startedAt });
    try {
      const ref = await requestRecommendation(tripId);
      for (;;) {
        if (!alive()) return;
        const result = await getRecommendation(tripId, ref.jobId);
        if (!alive()) return;
        const { status } = result.job;
        if (status === 'SUCCEEDED') {
          setState({ phase: 'done', result, startedAt });
          return;
        }
        if (status === 'FAILED' || status === 'CANCELLED') {
          setState({ phase: 'failed', result, startedAt });
          return;
        }
        if (Date.now() - startedAt >= TIMEOUT_MS) {
          setState({ phase: 'failed', result, startedAt });
          return;
        }
        setState({ phase: 'running', result, startedAt });
        await wait(POLL_MS);
      }
    } catch {
      if (alive()) setState({ phase: 'failed', result: null, startedAt });
    }
  }, [tripId]);

  return { ...state, start };
}
