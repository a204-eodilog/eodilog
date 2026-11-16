import { applyPhotoClassification, getClassificationJob, requestPhotoClassification } from './api';
import { successfulVersions } from './photo-rules';
import type { TripPhoto } from './types';
/**
 * 올린 사진의 AI 주제 분류(풍경·음식·사람·기타). 서버에는 요청·결과 적용 API가 있었지만 앱이 부르지 않아
 * 사진이 늘 '전체'에만 보였다(2026-11-16 공기계).
 * POST /trips/{tripId}/photo-classifications → GET /jobs/{jobId} 기다리기 → POST …/{jobId}/apply.
 * 실패해도 사진은 그대로라 조용히 끝낸다(AI 기능 꺼짐 409 포함)
 */

/** 한 번에 보낼 수 있는 사진 수(명세: 1~50장) */
export const CLASSIFY_MAX = 50;
/** 결과를 기다리는 간격과 최대 횟수(2초 × 45 = 90초) */
export const classifyTiming = { intervalMs: 2000, maxPolls: 45 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function classifyChunk(tripId: string, photos: readonly TripPhoto[]): Promise<boolean> {
  const jobId = await requestPhotoClassification(
    tripId,
    photos.map((p) => p.id),
  );
  for (let i = 0; i < classifyTiming.maxPolls; i += 1) {
    await sleep(classifyTiming.intervalMs);
    const job = await getClassificationJob(jobId);
    if (job.status === 'QUEUED' || job.status === 'RUNNING') continue;
    if (job.status !== 'SUCCEEDED') return false;
    const expected = successfulVersions(job.result, new Map(photos.map((p) => [p.id, p.version])));
    if (expected.length === 0) return false;
    await applyPhotoClassification(tripId, jobId, expected);
    return true;
  }
  return false;
}

/** 올린 사진을 50장씩 나눠 분류하고 적용한다. 하나라도 적용됐으면 true. 오류는 던지지 않는다 */
export async function classifyUploaded(
  tripId: string,
  photos: readonly TripPhoto[],
): Promise<boolean> {
  let applied = false;
  for (let i = 0; i < photos.length; i += CLASSIFY_MAX) {
    try {
      applied = (await classifyChunk(tripId, photos.slice(i, i + CLASSIFY_MAX))) || applied;
    } catch {
      // AI 기능 꺼짐(409)·장애. 사진은 이미 올라갔으니 분류만 건너뛴다
    }
  }
  return applied;
}
