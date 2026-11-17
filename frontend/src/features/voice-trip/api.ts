// 실험: 보통은 백엔드(/api/v1/voice-trip)가 로그인한 요청을 내부 AI 서버로 넘긴다.
// EXPO_PUBLIC_VOICE_PLAN_URL이 있으면 그 AI 서버에 바로 붙는다(노트북 개발용, 폰은 adb reverse)
import { Platform } from 'react-native';

import { apiClient } from '@/api/client';
import { toApiError } from '@/api/errors';
import { env } from '@/config/env';
import { createManualPlace, searchPlaces } from '@/features/place/api';
import type { Place } from '@/features/place/types';
import { VOICE_UPLOAD_MIME, VOICE_UPLOAD_NAME } from '@/lib/voice-recording';

import {
  matchOurPlace,
  type AiPlace,
  type Candidate,
  type FixResult,
  type TripJobView,
  type TripVoiceDraft,
} from './voice-trip-rules';

/** 10분 녹음 올리기는 느린 망에서 오래 걸릴 수 있다 */
const UPLOAD_TIMEOUT_MS = 120_000;
const FIX_TIMEOUT_MS = 60_000;
const SHORT_TIMEOUT_MS = 15_000;

export class VoiceTripError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
  }
}

/** 테스트 모드(가짜 서버)에는 이 API가 없어 노트북 주소가 있을 때만 연다 */
export const voiceTripAvailable = () => !env.devMock || !!env.voicePlanUrl;

async function call<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  if (!env.voicePlanUrl) return viaBackend<T>(path, init, timeoutMs);
  return direct<T>(
    `${env.voicePlanUrl.replace(/\/$/, '')}/ai/v1/voice-trip${path}`,
    init,
    timeoutMs,
  );
}

async function viaBackend<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  try {
    const isForm = init.body instanceof FormData;
    const { data } = await apiClient.request<{ data: T }>({
      url: `/voice-trip${path}`,
      method: init.method ?? 'GET',
      data: isForm ? init.body : init.body ? JSON.parse(String(init.body)) : undefined,
      headers: isForm ? { 'Content-Type': 'multipart/form-data' } : undefined,
      timeout: timeoutMs,
    });
    return data.data;
  } catch (e) {
    const err = toApiError(e);
    if (err.kind !== 'http')
      throw new VoiceTripError('서버에 닿지 않아요. 인터넷 연결을 확인해 주세요');
    throw new VoiceTripError(err.message, err.code);
  }
}

async function direct<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new VoiceTripError('AI 서버에 닿지 않아요. 노트북 서버와 연결을 확인해 주세요');
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string; message?: string };
  };
  if (!res.ok || body.data === undefined) {
    throw new VoiceTripError(
      body.error?.message ?? `AI 서버 오류(${res.status})`,
      body.error?.code ?? null,
    );
  }
  return body.data;
}

async function appendAudio(form: FormData, uri: string) {
  if (Platform.OS === 'web') {
    // 웹 녹음은 blob 주소라 내용을 읽어 붙인다(webm)
    const blob = await (await fetch(uri)).blob();
    form.append('audio', blob, 'recording.webm');
  } else {
    form.append('audio', {
      uri,
      name: VOICE_UPLOAD_NAME,
      type: VOICE_UPLOAD_MIME,
    } as unknown as Blob);
  }
}

/** 쭉 말한 녹음(또는 글)을 보내 정리 작업을 만든다 */
export async function startTripJob(input: { audioUri?: string; text?: string }) {
  const form = new FormData();
  if (input.audioUri) await appendAudio(form, input.audioUri);
  else if (input.text) form.append('text', input.text);
  return call<TripJobView>('/jobs', { method: 'POST', body: form }, UPLOAD_TIMEOUT_MS);
}

export function getTripJob(jobId: string) {
  return call<TripJobView>(`/jobs/${jobId}`, { method: 'GET' }, SHORT_TIMEOUT_MS);
}

/** 고칠 말(짧은 녹음 또는 글)로 바꿀 명령을 받는다 */
export async function postFix(draft: TripVoiceDraft, input: { audioUri?: string; text?: string }) {
  const form = new FormData();
  form.append('draft', JSON.stringify(draft));
  if (input.audioUri) await appendAudio(form, input.audioUri);
  else if (input.text) form.append('text', input.text);
  return call<FixResult>('/fixes', { method: 'POST', body: form }, FIX_TIMEOUT_MS);
}

/** AI가 고른 곳 대신 고를 근처 후보 */
export function getCandidates(body: {
  query: string;
  destination: string | null;
  near: { latitude: number; longitude: number } | null;
}) {
  return call<Candidate[]>(
    '/candidates',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    SHORT_TIMEOUT_MS,
  );
}

/**
 * AI가 찾은 장소를 우리 서버 장소로 바꾼다. 우리 장소 검색에서 같은 가게(이름·300m 안)를 찾고,
 * 없으면 그 위치로 새 장소를 만든다. 둘 다 실패하면 null
 */
export async function toOurPlace(place: AiPlace, regionId?: string): Promise<Place | null> {
  try {
    const found = await searchPlaces(place.name, {
      regionId,
      near: { latitude: place.latitude, longitude: place.longitude },
    });
    const same = matchOurPlace(place, found);
    if (same) return same;
  } catch {
    // 검색이 안 되면 위치로 만든다
  }
  try {
    return await createManualPlace({
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
    });
  } catch {
    return null;
  }
}
