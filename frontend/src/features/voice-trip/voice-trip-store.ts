import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';

import { toast } from '@/components/ui';

import { getTripJob, startTripJob, VoiceTripError } from './api';
import type { TripJobView, TripVoiceDraft } from './voice-trip-rules';

/**
 * 말로 새 여행 작업 하나를 앱 전체에서 들고 있는다. 정리 중에 다른 화면으로 가도 계속 확인하고,
 * 다 되면 안내(보기)를 띄운다. 실험이라 알림 대신 앱 안 안내를 쓴다(DEV에서는 백엔드 작업 + 알림).
 * 앱을 끄면 사라진다. AI 서버도 작업을 30분만 둔다.
 */
export type VoiceTripState =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'running'; job: TripJobView }
  | { kind: 'ready'; job: TripJobView; draft: TripVoiceDraft }
  | { kind: 'failed'; message: string; canRetry: boolean };

const POLL_MS = 1_500;
/** 확인이 이만큼 이어서 실패하면 멈춘다 */
const MAX_POLL_ERRORS = 5;

let state: VoiceTripState = { kind: 'idle' };
/** 보낸 말. 실패하면 같은 녹음으로 다시 보낸다. 초안을 받거나 버리면 녹음 파일을 지운다 */
let sent: { input: { audioUri?: string; text?: string }; cleanup?: () => void } | null = null;
let run = 0;
/** 초안 화면을 보고 있으면 다 됐다는 안내를 띄우지 않는다 */
let watching = false;
const listeners = new Set<() => void>();

function set(next: VoiceTripState) {
  state = next;
  listeners.forEach((l) => l());
}

export function useVoiceTrip(): VoiceTripState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function setWatchingDraft(on: boolean) {
  watching = on;
}

/** 녹음(또는 글)을 보내고 다 될 때까지 확인한다 */
export async function beginVoiceTrip(
  input: { audioUri?: string; text?: string },
  /** 녹음 파일 지우기. 초안을 받았거나 버릴 때 부른다(서버는 받아쓴 뒤 바로 놓는다) */
  cleanup?: () => void,
) {
  if (sent && sent.cleanup !== cleanup) sent.cleanup?.();
  sent = { input, cleanup };
  const mine = ++run;
  set({ kind: 'uploading' });
  let job: TripJobView;
  try {
    job = await startTripJob(input);
  } catch (e) {
    if (mine === run) set({ kind: 'failed', message: messageOf(e), canRetry: true });
    return;
  }
  let errors = 0;
  while (mine === run) {
    if (job.status === 'SUCCEEDED' && job.draft) {
      dropSent();
      set({ kind: 'ready', job, draft: job.draft });
      if (!watching) {
        toast.success('말로 만든 여행 초안이 준비됐어요', {
          action: { label: '보기', onPress: () => router.push('/trips/voice-draft') },
        });
      }
      return;
    }
    if (job.status === 'FAILED') {
      set({
        kind: 'failed',
        message: job.error?.message ?? '정리하지 못했어요',
        canRetry: job.error?.code !== 'INSUFFICIENT_DATA',
      });
      return;
    }
    set({ kind: 'running', job });
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (mine !== run) return;
    try {
      job = await getTripJob(job.jobId);
      errors = 0;
    } catch (e) {
      errors += 1;
      if (errors >= MAX_POLL_ERRORS) {
        set({ kind: 'failed', message: messageOf(e), canRetry: true });
        return;
      }
    }
  }
}

/** 초안을 고쳤다 */
export function updateDraft(draft: TripVoiceDraft) {
  if (state.kind === 'ready') set({ ...state, draft });
}

/** 버리거나 여행을 만들었다 */
export function clearVoiceTrip() {
  run += 1;
  dropSent();
  set({ kind: 'idle' });
}

/** 실패했을 때 같은 녹음으로 다시 보낸다 */
export function retryVoiceTrip() {
  if (sent) void beginVoiceTrip(sent.input, sent.cleanup);
}

function dropSent() {
  sent?.cleanup?.();
  sent = null;
}

function messageOf(e: unknown): string {
  return e instanceof VoiceTripError ? e.message : '정리하지 못했어요. 다시 해 주세요';
}
