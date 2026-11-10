import { apiClient } from '@/api/client';
import type { DataResponse } from '@/api/types';

import type { JobRef, RecommendationResult } from './types';

// 계약: specs/20261109-143231-recommendations/contracts/routes.md
// 백엔드에 아직 없다(Q-9-1). 테스트 모드 가짜 서버가 같은 형식으로 답한다

/**
 * POST /trips/{tripId}/recommendations. 여행지 전체로 추천해 regionId는 보내지 않는다.
 * 비동기 작업을 만드는 POST라 Idempotency-Key를 함께 보낸다(api-spec 공통 규칙)
 */
export async function requestRecommendation(
  tripId: string,
  idempotencyKey: string,
): Promise<JobRef> {
  const { data } = await apiClient.post<DataResponse<JobRef>>(
    `/trips/${tripId}/recommendations`,
    {},
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return data.data;
}

/** GET /trips/{tripId}/recommendations/{jobId}. 작업 상태와 결과를 함께 준다 */
export async function getRecommendation(
  tripId: string,
  jobId: string,
  signal?: AbortSignal,
): Promise<RecommendationResult> {
  const { data } = await apiClient.get<DataResponse<RecommendationResult>>(
    `/trips/${tripId}/recommendations/${encodeURIComponent(jobId)}`,
    { signal },
  );
  return data.data;
}
