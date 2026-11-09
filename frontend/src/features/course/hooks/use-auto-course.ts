import { useEffect, useRef, useState } from 'react';

import { getAutoCourse, requestAutoCourse } from '../api';
import type { CourseContent } from '../types';
import { JobStopped, waitForJob } from '../wait-job';

export const AUTO_POLL_MS = 1500;
export const AUTO_TIMEOUT_MS = 60_000;

/**
 * 첫 코스 자동 추천(POST proposals → GET proposals/{jobId} 기다림).
 * 결과는 초안의 재료일 뿐이고 지금 코스는 [완료] 전까지 바뀌지 않는다(apply는 S29 흐름).
 * 백엔드에 아직 없어 실서버에서는 실패로 끝난다(가정 Q-6-5). 화면을 나가면 기다림을 멈춘다.
 */
export function useAutoCourse(tripId: string) {
  const [status, setStatus] = useState<'idle' | 'running' | 'failed'>('idle');
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  /** 끝나면 추천 코스, 실패·시간 초과면 null. 이미 기다리는 중이면 null */
  async function start(expectedVersion: number): Promise<CourseContent | null> {
    if (running.current) return null;
    running.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setStatus('running');
    try {
      const ref = await requestAutoCourse(tripId, expectedVersion);
      const proposal = await waitForJob(
        (signal) => getAutoCourse(tripId, ref.jobId, signal),
        (p) => p.job.status,
        abort.signal,
        { interval: AUTO_POLL_MS, timeout: AUTO_TIMEOUT_MS },
      );
      const content =
        proposal?.job.status === 'SUCCEEDED' &&
        proposal.proposed &&
        proposal.proposed.items.length > 0
          ? proposal.proposed
          : null;
      if (!abort.signal.aborted) setStatus(content ? 'idle' : 'failed');
      return content;
    } catch (e) {
      if (!(e instanceof JobStopped) && !abort.signal.aborted) setStatus('failed');
      return null;
    } finally {
      running.current = false;
    }
  }

  return { start, status, reset: () => setStatus('idle') };
}
