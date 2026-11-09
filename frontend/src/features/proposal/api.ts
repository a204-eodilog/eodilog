import { apiClient } from '@/api/client';
import type { DataResponse } from '@/api/types';
import type { Itinerary, JobRef } from '@/features/course/types';

// 계약: specs/20261109-153021-ai-proposals/contracts/routes.md
// 변경안·적용·되돌리기 백엔드는 아직 없다(Q-11-1). 테스트 모드 가짜 서버가 같은 형식으로 답한다.
// 변경안 조회는 코스 기능의 getAutoCourse(GET .../proposals/{jobId})를 쓴다

/** 장소 하나를 뺀 코스를 다시 짠다. 결과는 GET .../proposals/{jobId} */
export async function requestRemoval(
  tripId: string,
  expectedVersion: number,
  placeId: string,
): Promise<JobRef> {
  const { data } = await apiClient.post<DataResponse<JobRef>>(
    `/trips/${tripId}/itinerary/proposals`,
    { reason: 'PLACE_REMOVED', expectedVersion, excludedPlaceIds: [placeId] },
  );
  return data.data;
}

/** 변경안을 지금 코스로 적용한다. 승인 단계 없이 동행 누구나. 그 사이 코스가 바뀌었으면 409 */
export async function applyProposal(
  tripId: string,
  jobId: string,
  expectedVersion: number,
): Promise<Itinerary> {
  const { data } = await apiClient.post<DataResponse<Itinerary>>(
    `/trips/${tripId}/itinerary/proposals/${encodeURIComponent(jobId)}/apply`,
    { expectedVersion },
  );
  return data.data;
}

/** 직전 적용을 한 번 되돌린다. 그 뒤 다른 쓰기가 있었으면 409 UNDO_UNAVAILABLE */
export async function undoApply(
  tripId: string,
  expectedVersion: number,
  appliedJobId: string,
): Promise<Itinerary> {
  const { data } = await apiClient.post<DataResponse<Itinerary>>(
    `/trips/${tripId}/itinerary/undo`,
    { expectedVersion, appliedJobId },
  );
  return data.data;
}
