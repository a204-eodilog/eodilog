import { apiClient } from '@/api/client';
import type { DataResponse } from '@/api/types';

import type {
  Itinerary,
  ItineraryProposal,
  ItineraryWrite,
  Job,
  JobRef,
  SavedPlace,
  SavedPlacePage,
  TransportMode,
} from './types';

// 계약: specs/20261109-121845-course/contracts/course-api.md
// 백엔드에 있는 것: 코스 조회·전체 교체, 작업 조회, 그룹 즐겨찾기.
// 자동 추천(proposals)과 다시 계산(routes/recalculate)은 API 명세대로 부르고 지금은 테스트 모드 가짜 서버만 답한다(가정 Q-6-5)

/** 그룹 즐겨찾기는 직접 만들기 재료라 서버 최대치로 받아 요청 수를 줄인다 */
const SAVED_PLACES_LIMIT = 100;

/** GET /trips/{tripId}/itinerary. 새 여행은 version 1의 빈 코스다 */
export async function getItinerary(tripId: string, signal?: AbortSignal): Promise<Itinerary> {
  const { data } = await apiClient.get<DataResponse<Itinerary>>(`/trips/${tripId}/itinerary`, {
    signal,
  });
  return data.data;
}

/**
 * PUT /trips/{tripId}/itinerary. 지금 코스를 통째로 바꾼다.
 * version이 다르면 409 VERSION_CONFLICT, 구간이 장소 쌍과 맞지 않으면 422 INVALID_ROUTE_LEGS
 */
export async function replaceItinerary(tripId: string, body: ItineraryWrite): Promise<Itinerary> {
  const { data } = await apiClient.put<DataResponse<Itinerary>>(`/trips/${tripId}/itinerary`, body);
  return data.data;
}

/** POST .../itinerary/proposals. 첫 코스 자동 추천 작업을 만든다. 지금 코스는 바꾸지 않는다 */
export async function requestAutoCourse(
  tripId: string,
  expectedVersion: number,
  defaultTransportMode: TransportMode = 'TRANSIT',
): Promise<JobRef> {
  const { data } = await apiClient.post<DataResponse<JobRef>>(
    `/trips/${tripId}/itinerary/proposals`,
    { reason: 'INITIAL', expectedVersion, defaultTransportMode },
  );
  return data.data;
}

/** GET .../itinerary/proposals/{jobId}. job.status가 SUCCEEDED면 proposed에 추천 코스가 있다 */
export async function getAutoCourse(
  tripId: string,
  jobId: string,
  signal?: AbortSignal,
): Promise<ItineraryProposal> {
  const { data } = await apiClient.get<DataResponse<ItineraryProposal>>(
    `/trips/${tripId}/itinerary/proposals/${jobId}`,
    { signal },
  );
  return data.data;
}

/** POST .../itinerary/routes/recalculate. 실패한 구간을 다시 구한다. 끝나면 코스를 다시 받는다 */
export async function recalculateRoutes(tripId: string, expectedVersion: number): Promise<JobRef> {
  const { data } = await apiClient.post<DataResponse<JobRef>>(
    `/trips/${tripId}/itinerary/routes/recalculate`,
    { expectedVersion },
  );
  return data.data;
}

/** GET /jobs/{jobId} */
export async function getJob(jobId: string, signal?: AbortSignal): Promise<Job> {
  const { data } = await apiClient.get<DataResponse<Job>>(`/jobs/${jobId}`, { signal });
  return data.data;
}

/** GET /trips/{tripId}/saved-places를 끝까지 넘겨 그룹 즐겨찾기 전부를 받는다. 응답은 감싸지 않는다 */
export async function getTripSavedPlaces(
  tripId: string,
  signal?: AbortSignal,
): Promise<SavedPlace[]> {
  const all: SavedPlace[] = [];
  let cursor: string | null = null;
  do {
    const params: Record<string, string | number> = { limit: SAVED_PLACES_LIMIT };
    if (cursor) params.cursor = cursor;
    const { data } = await apiClient.get<SavedPlacePage>(`/trips/${tripId}/saved-places`, {
      params,
      signal,
    });
    all.push(...data.items);
    cursor = data.page.hasNext ? data.page.nextCursor : null;
  } while (cursor);
  return all;
}
