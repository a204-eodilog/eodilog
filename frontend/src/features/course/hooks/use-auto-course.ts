import { useEffect, useRef, useState } from 'react';

import { API_ERROR, toApiError } from '@/api/errors';
import { createIdempotencyKeyStore } from '@/api/idempotency';

import { getAutoCourse, requestAutoCourse } from '../api';
import type { CourseContent } from '../types';
import { JobStopped, waitForJob } from '../wait-job';

export const AUTO_POLL_MS = 1500;
/**
 * 기다리는 최대 시간. AI가 잠깐 실패하면 백엔드가 다시 시도해 1~3분 걸릴 수 있다(백엔드 안내 2026-11-09).
 * 그 사이 작업은 QUEUED로 남으므로 백엔드보다 먼저 실패로 끝내지 않게 넉넉히 둔다
 */
export const AUTO_TIMEOUT_MS = 4 * 60_000;
/** 요청이 곧바로 실패해도 누른 버튼이 도는 표시를 이만큼은 보인다. 번쩍이고 끝나지 않게 */
export const AUTO_MIN_REQUEST_MS = 400;

/**
 * 자동 추천 실패 까닭.
 * noDates·noPlaces: 422 INSUFFICIENT_DATA. 여행 기간이 없거나 모은 장소가 없다. 다시 해도 같다
 * tooMany: 422 INPUT_LIMIT_EXCEEDED. 대상 장소가 200곳을 넘는다
 * conflict: 409 VERSION_CONFLICT. 그 사이 코스가 바뀌었다. 최신 코스로 다시 하면 된다
 * revoked: 작업 오류 POLICY_REVOKED. 요청한 사람이 여행을 나갔다
 * failed: 그 밖(AI 거부, 일시 장애, 시간 초과)
 */
export type AutoFailure = 'noDates' | 'noPlaces' | 'tooMany' | 'conflict' | 'revoked' | 'failed';

/** 작업을 만들기 전 거절 응답을 실패 까닭으로 */
export function requestFailure(
  code: string | null | undefined,
  fields: Record<string, string>,
): AutoFailure {
  if (code === 'INSUFFICIENT_DATA') {
    // 둘 다 없으면 장소부터 모으게 한다. 기간은 코스 짜기 첫 화면에서 정할 수 있다
    if (fields.places !== undefined) return 'noPlaces';
    if (fields['trip.startDate'] !== undefined) return 'noDates';
    return 'noPlaces';
  }
  if (code === 'INPUT_LIMIT_EXCEEDED') return 'tooMany';
  if (code === API_ERROR.VERSION_CONFLICT) return 'conflict';
  return 'failed';
}

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
  const [failure, setFailure] = useState<AutoFailure | null>(null);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const keys = useRef(createIdempotencyKeyStore()).current;

  useEffect(() => () => controller.current?.abort(), []);

  /**
   * 끝나면 추천 코스와 작업 번호, 실패·시간 초과면 null. 이미 기다리는 중이면 null.
   * 작업 번호는 추천안을 그대로 저장할 때 적용 API에 쓴다. onAccepted는 서버가 요청을 받았을 때 한 번 부른다
   */
  async function start(
    expectedVersion: number,
    onAccepted?: () => void,
  ): Promise<{ content: CourseContent; jobId: string } | null> {
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
        if (!content)
          setFailure(proposal?.job.error?.code === 'POLICY_REVOKED' ? 'revoked' : 'failed');
      }
      return content ? { content, jobId: ref.jobId } : null;
    } catch (e) {
      if (e instanceof JobStopped || abort.signal.aborted) return null;
      const { code, fields } = toApiError(e);
      const left = AUTO_MIN_REQUEST_MS - (Date.now() - startedAt);
      if (!accepted && left > 0) await new Promise((r) => setTimeout(r, left));
      if (!abort.signal.aborted) {
        setStatus('failed');
        setFailure(requestFailure(code, fields));
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
