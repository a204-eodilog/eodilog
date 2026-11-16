import { toApiError } from '@/api/errors';
import { getSettings } from '@/features/settings/api';

import {
  applyPhotoClassification,
  getClassificationJob,
  getTripPhotos,
  requestPhotoClassification,
} from './api';
import { successfulVersions } from './photo-rules';
import type { TripPhoto } from './types';

/**
 * 올린 사진의 AI 주제 분류(풍경·음식·사람·기타). 서버에는 요청·결과 적용 API가 있었지만 앱이 부르지 않아
 * 사진이 늘 '전체'에만 보였다(2026-11-16 공기계).
 * POST /trips/{tripId}/photo-classifications → GET /jobs/{jobId} 기다리기 → POST …/{jobId}/apply.
 *
 * - 사진 분류 설정이 AUTO일 때만 한다. CONFIRM은 적용 전에 사용자 확인이 필요한데(명세 UserSettings) 확인 화면이 아직 없어
 *   요청하지 않는다. OFF는 서버가 409로 막는다
 * - apply는 묶음 전체를 한 번에 적용해서, 그사이 한 장이라도 고쳐지면 409로 전부 실패한다. 그때는 사진을 다시 읽어
 *   요청 때와 version이 같은 사진만 새 작업으로 한 번 더 보낸다(같은 작업에 다른 본문은 409라서 새로 요청한다).
 *   요청이 404(그사이 지운 사진)여도 같은 방식으로 남은 사진만 다시 보낸다
 * - 결과 조회가 잠깐 실패해도(끊김·5xx·429) 남은 횟수 안에서 다시 본다. 401·403·404만 바로 끝낸다
 * - 50장 묶음은 요청을 먼저 모두 보내고 함께 기다린다
 * 실패해도 사진은 이미 올라갔으니 조용히 끝낸다
 */

/** 한 번에 보낼 수 있는 사진 수(명세: 1~50장) */
export const CLASSIFY_MAX = 50;
/** 결과를 기다리는 간격과 최대 횟수(2초 × 45 = 90초) */
export const classifyTiming = { intervalMs: 2000, maxPolls: 45 };

/** 다시 해도 소용없는 조회 오류 */
const FINAL_STATUSES = [401, 403, 404];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 요청 때와 version이 같은(그사이 지우거나 고치지 않은) 사진만 지금 값으로 */
async function stillUnchanged(tripId: string, photos: readonly TripPhoto[]): Promise<TripPhoto[]> {
  const current = new Map((await getTripPhotos(tripId)).map((p) => [p.id, p]));
  return photos.flatMap((p) => {
    const now = current.get(p.id);
    return now && now.version === p.version ? [now] : [];
  });
}

async function classifyChunk(
  tripId: string,
  photos: readonly TripPhoto[],
  retried = false,
): Promise<boolean> {
  if (photos.length === 0) return false;
  const again = async () => {
    if (retried) return false;
    return classifyChunk(tripId, await stillUnchanged(tripId, photos), true);
  };

  let jobId: string;
  try {
    jobId = await requestPhotoClassification(
      tripId,
      photos.map((p) => p.id),
    );
  } catch (error) {
    return toApiError(error).status === 404 ? again() : false;
  }

  for (let i = 0; i < classifyTiming.maxPolls; i += 1) {
    await sleep(classifyTiming.intervalMs);
    let job;
    try {
      job = await getClassificationJob(jobId);
    } catch (error) {
      if (FINAL_STATUSES.includes(toApiError(error).status ?? 0)) return false;
      continue;
    }
    if (job.status === 'QUEUED' || job.status === 'RUNNING') continue;
    if (job.status !== 'SUCCEEDED') return false;
    const expected = successfulVersions(job.result, new Map(photos.map((p) => [p.id, p.version])));
    if (expected.length === 0) return false;
    try {
      await applyPhotoClassification(tripId, jobId, expected);
      return true;
    } catch (error) {
      return toApiError(error).status === 409 ? again() : false;
    }
  }
  return false;
}

/** 올린 사진을 50장씩 나눠 분류하고 적용한다. 하나라도 적용됐으면 true. 오류는 던지지 않는다 */
export async function classifyUploaded(
  tripId: string,
  photos: readonly TripPhoto[],
): Promise<boolean> {
  if (photos.length === 0) return false;
  try {
    if ((await getSettings()).ai.photoClassification !== 'AUTO') return false;
  } catch {
    return false;
  }
  const chunks: TripPhoto[][] = [];
  for (let i = 0; i < photos.length; i += CLASSIFY_MAX) {
    chunks.push(photos.slice(i, i + CLASSIFY_MAX));
  }
  const results = await Promise.all(
    chunks.map((chunk) => classifyChunk(tripId, chunk).catch(() => false)),
  );
  return results.some(Boolean);
}
