import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';

import { API_ERROR, toApiError } from '@/api/errors';
import { toast } from '@/components/ui';

import { adoptSuggestion, getChecklist, getSuggestionJob, requestSuggestions } from '../api';
import { CHECKLIST_TEXT } from '../checklist-rules';
import { adoptSuggestions, pickSuggestions } from '../suggestion-merge';
import type { ChecklistItem, JobRef } from '../types';

import { checklistKey } from './checklist-keys';
import { appendCachedItem } from './use-checklist';

/** 작업 상태를 묻는 간격 */
export const SUGGEST_POLL_MS = 1500;
/** 이보다 오래 걸리면 실패로 본다 */
export const SUGGEST_TIMEOUT_MS = 2 * 60_000;
/** 같은 키 요청이 아직 처리 중(409 REQUEST_IN_PROGRESS)이면 이만큼 기다렸다 한 번 더 보낸다 */
const IN_PROGRESS_RETRY_MS = 1000;

/** general: 작업 실패·취소·시간 초과·연결 오류 / disabled: 내 준비물 추천 설정이 꺼짐 */
export type SuggestFailure = 'general' | 'disabled';

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
 * 준비물 다시 제안 받기. 제안 작업을 하나 요청하고 끝날 때까지 기다린 뒤 지금 목록에 없는 이름만 채택한다.
 * 작업 ID를 받기 전까지는 같은 Idempotency-Key를 써서, 응답을 놓쳐 다시 눌러도 작업이 하나만 생긴다.
 * 화면을 나가면 기다림을 멈추고 결과를 더하지 않는다.
 */
export function useSuggestChecklist(tripId: string) {
  const queryClient = useQueryClient();
  const [suggesting, setSuggesting] = useState(false);
  const [failure, setFailure] = useState<SuggestFailure | null>(null);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);
  /** 작업 ID를 받기 전에 끊긴 요청의 키. 다시 누르면 이 키로 보내 서버가 같은 작업을 돌려준다 */
  const pendingKey = useRef<string | null>(null);

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  async function request(key: string, signal: AbortSignal): Promise<JobRef> {
    try {
      return await requestSuggestions(tripId, key);
    } catch (e) {
      if (toApiError(e).code !== API_ERROR.REQUEST_IN_PROGRESS) throw e;
      await wait(IN_PROGRESS_RETRY_MS, signal);
      return requestSuggestions(tripId, key);
    }
  }

  async function run(signal: AbortSignal): Promise<SuggestFailure | null> {
    const key = pendingKey.current ?? randomUUID();
    pendingKey.current = key;
    let ref: JobRef;
    try {
      ref = await request(key, signal);
    } catch (e) {
      // 서버가 답했으면(409 꺼짐 등) 그 키는 끝났다. 답을 못 받았으면 다음 시도에 같은 키를 쓴다
      if (toApiError(e).kind === 'http') pendingKey.current = null;
      throw e;
    }
    pendingKey.current = null;
    const deadline = Date.now() + SUGGEST_TIMEOUT_MS;
    let job = await getSuggestionJob(ref.jobId, signal);
    while (job.status === 'QUEUED' || job.status === 'RUNNING') {
      if (Date.now() >= deadline) return 'general';
      await wait(SUGGEST_POLL_MS, signal);
      job = await getSuggestionJob(ref.jobId, signal);
    }
    if (job.status !== 'SUCCEEDED' || !job.result) return 'general';

    const current =
      queryClient.getQueryData<ChecklistItem[]>(checklistKey(tripId)) ??
      (await getChecklist(tripId, signal));
    const picks = pickSuggestions(current, job.result.items);
    const outcome = await adoptSuggestions(picks, (pick) => {
      if (signal.aborted) throw new Stopped();
      return adoptSuggestion(tripId, {
        label: pick.label,
        sourceJobId: job.id,
        suggestionIndex: pick.index,
      });
    });
    for (const item of outcome.added) appendCachedItem(queryClient, tripId, item);
    // 다른 동행이 먼저 채택한 제안이 있었으면 그 항목을 보이도록 다시 받는다
    if (outcome.skipped > 0 || outcome.failed) {
      void queryClient.invalidateQueries({ queryKey: checklistKey(tripId) });
    }
    if (outcome.disabled) return 'disabled';
    if (outcome.failed) return 'general';
    if (outcome.added.length > 0) toast.success(`준비물 ${outcome.added.length}개를 더했어요`);
    else toast.show(CHECKLIST_TEXT.nothingNew);
    return null;
  }

  async function start() {
    if (running.current) return;
    running.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setFailure(null);
    setSuggesting(true);
    let result: SuggestFailure | null;
    try {
      result = await run(abort.signal);
    } catch (e) {
      if (e instanceof Stopped || abort.signal.aborted) return;
      result = toApiError(e).code === API_ERROR.AI_FEATURE_DISABLED ? 'disabled' : 'general';
    } finally {
      running.current = false;
    }
    if (abort.signal.aborted) return;
    setFailure(result);
    setSuggesting(false);
  }

  return { start, suggesting, failure };
}
