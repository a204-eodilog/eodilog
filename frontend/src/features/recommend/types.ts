import type { Place } from '@/features/place/types';
import type { JobRef, Region } from '@/features/trip/types';

export type { JobRef };

export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

/** 비동기 작업. error는 실패·취소일 때만 */
export type Job = {
  id: string;
  kind: string;
  status: JobStatus;
  progress: number;
  error: { code: string; message: string } | null;
  createdAt: string;
  finishedAt: string | null;
};

/** 추천 한 줄. REGION이면 region, PLACE면 place가 있다 */
export type RecommendationItem = {
  type: 'REGION' | 'PLACE';
  region: Region | null;
  place: Place | null;
  reason: string;
};

/** GET /trips/{tripId}/recommendations/{jobId}. 끝나기 전에는 items가 비어 있다 */
export type RecommendationResult = {
  job: Job;
  items: RecommendationItem[];
  basis: { sharedPlaceCount: number; usedMemberCount: number };
  insufficientData: boolean;
};
