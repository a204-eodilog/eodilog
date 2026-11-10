import { useEffect, useRef, useState } from 'react';

import { API_ERROR, toApiError } from '@/api/errors';
import { createIdempotencyKeyStore } from '@/api/idempotency';

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
 *
 * Idempotency-Key: 응답을 못 받은 채 다시 보내면 같은 키를 써서 작업이 두 개 생기지 않게 한다.
 * 서버가 한 번이라도 답했으면(작업을 받았거나 거절했으면) 그 키는 끝난 것이라 버린다.
 * 그러지 않으면 같은 version으로 다시 시도할 때 서버가 이미 실패한 첫 작업을 그대로 돌려준다.
 */
export function useAutoCourse(tripId: string) {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'running' | 'failed'>('idle');
  /**
   * 실패 까닭. noPlaces: 모은 장소나 기간이 없어 서버가 거절(422 INSUFFICIENT_DATA), 다시 해도 같다.
   * conflict: 그 사이 코스가 바뀌어 409, 최신 코스로 다시 하면 된다. failed: 그 밖
   */
  const [failure, setFailure] = useState<'noPlaces' | 'conflict' | 'failed' | null>(null);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const keys = useRef(createIdempotencyKeyStore()).current;

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
    setFailure(null);
    const startedAt = Date.now();
    let accepted = false;
    try {
      let ref;
      try {
        ref = await requestAutoCourse(tripId, expectedVersion, keys.keyFor({ expectedVersion }));
        keys.clear();
      } catch (e) {
        if (toApiError(e).status !== null) keys.clear();
        throw e;
      }
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
      if (!abort.signal.aborted) {
        setStatus(content ? 'idle' : 'failed');
        if (!content) setFailure('failed');
      }
      return content;
    } catch (e) {
      if (e instanceof JobStopped || abort.signal.aborted) return null;
      const { code } = toApiError(e);
      const left = AUTO_MIN_REQUEST_MS - (Date.now() - startedAt);
      if (!accepted && left > 0) await new Promise((r) => setTimeout(r, left));
      if (!abort.signal.aborted) {
        setStatus('failed');
        setFailure(
          code === 'INSUFFICIENT_DATA'
            ? 'noPlaces'
            : code === API_ERROR.VERSION_CONFLICT
              ? 'conflict'
              : 'failed',
        );
      }
      return null;
    } finally {
      running.current = false;
    }
  }

  return {
    start,
    status,
    failure,
    /** 지금 요청을 보내거나 기다리는 중인지. 같은 순간의 두 번째 누름을 막는다 */
    isBusy: () => running.current,
    reset: () => setStatus('idle'),
  };
}
