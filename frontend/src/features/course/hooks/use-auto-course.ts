import { useEffect, useRef, useState } from 'react';

import { getAutoCourse, requestAutoCourse } from '../api';
import type { CourseContent } from '../types';
import { JobStopped, waitForJob } from '../wait-job';

export const AUTO_POLL_MS = 1500;
export const AUTO_TIMEOUT_MS = 60_000;
/** 요청이 곧바로 실패해도 누른 버튼이 도는 표시를 이만큼은 보인다. 번쩍이고 끝나지 않게 */
export const AUTO_MIN_REQUEST_MS = 400;

/**
 * 첫 코스 자동 추천(POST proposals → GET proposals/{jobId} 기다림).
 * 결과는 초안의 재료일 뿐이고 지금 코스는 [완료] 전까지 바뀌지 않는다(apply는 S29 흐름).
 * 백엔드에 아직 없어 실서버에서는 실패로 끝난다(가정 Q-6-5). 화면을 나가면 기다림을 멈춘다.
 * requesting은 요청을 보내고 서버가 받기 전, running은 서버가 받아 작업을 기다리는 중이다.
 * 화면은 running이 된 뒤에만 '코스를 짜고 있어요'를 보여, 요청이 바로 실패할 때 그 화면이 잠깐 번쩍이지 않게 한다.
 */
export function useAutoCourse(tripId: string) {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'running' | 'failed'>('idle');
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  /**
   * 끝나면 추천 코스, 실패·시간 초과면 null. 이미 기다리는 중이면 null.
   * onAccepted는 서버가 요청을 받아 작업이 시작됐을 때 한 번 부른다
   */
  async function start(
    expectedVersion: number,
    onAccepted?: () => void,
  ): Promise<CourseContent | null> {
    if (running.current) return null;
    running.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setStatus('requesting');
    const startedAt = Date.now();
    let accepted = false;
    try {
      const ref = await requestAutoCourse(tripId, expectedVersion);
      if (abort.signal.aborted) return null;
      accepted = true;
      setStatus('running');
      onAccepted?.();
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
      if (e instanceof JobStopped || abort.signal.aborted) return null;
      const left = AUTO_MIN_REQUEST_MS - (Date.now() - startedAt);
      if (!accepted && left > 0) await new Promise((r) => setTimeout(r, left));
      if (!abort.signal.aborted) setStatus('failed');
      return null;
    } finally {
      running.current = false;
    }
  }

  return { start, status, reset: () => setStatus('idle') };
}
