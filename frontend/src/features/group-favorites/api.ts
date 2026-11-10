import { apiClient } from '@/api/client';
import type { DataResponse } from '@/api/types';

import type { CoursePlaces, ListQuery, SavedPlace, SavedPlacePage } from './types';

// 계약: specs/20261109-131605-group-favorites/contracts/group-api.md

/** 한 번에 받는 장소 수. 서버는 1~100, 기본 20 */
export const PAGE_LIMIT = 20;

/** GET /trips/{tripId}/saved-places. 최근 담은 순, 응답은 감싸지 않는다 */
export async function getSavedPlaces(
  tripId: string,
  query: ListQuery,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<SavedPlacePage> {
  const params: Record<string, string | number> = { filter: query.filter, limit: PAGE_LIMIT };
  if (query.memberId) params.memberId = query.memberId;
  if (cursor) params.cursor = cursor;
  const { data } = await apiClient.get<SavedPlacePage>(`/trips/${tripId}/saved-places`, {
    params,
    signal,
  });
  return data;
}

/** PUT .../saved-places/{placeId}/me. 내 이름으로 담는다. 같은 장소면 덮어쓴다 */
export async function putMySave(tripId: string, placeId: string): Promise<SavedPlace> {
  const { data } = await apiClient.put<DataResponse<SavedPlace>>(
    `/trips/${tripId}/saved-places/${placeId}/me`,
    {},
  );
  return data.data;
}

/** PATCH .../saved-places/{placeId}/me. 내 메모만 바꾼다(2000자). 내 저장이 없으면 404 */
export async function patchMyMemo(
  tripId: string,
  placeId: string,
  memo: string,
): Promise<SavedPlace> {
  const { data } = await apiClient.patch<DataResponse<SavedPlace>>(
    `/trips/${tripId}/saved-places/${placeId}/me`,
    { memo },
  );
  return data.data;
}

/** DELETE .../saved-places/{placeId}/me. 내 저장만 지운다. 코스는 바뀌지 않는다 */
export async function deleteMySave(tripId: string, placeId: string): Promise<void> {
  await apiClient.delete(`/trips/${tripId}/saved-places/${placeId}/me`);
}

/** GET /trips/{tripId}/itinerary에서 코스에 든 장소와 마지막으로 고친 동행만 꺼낸다 */
export async function getCoursePlaces(tripId: string, signal?: AbortSignal): Promise<CoursePlaces> {
  const { data } = await apiClient.get<
    DataResponse<{ items: { place: { id: string } }[]; updatedByMemberId?: string | null }>
  >(`/trips/${tripId}/itinerary`, { signal });
  return {
    placeIds: new Set(data.data.items.map((i) => i.place.id)),
    updatedByMemberId: data.data.updatedByMemberId ?? null,
  };
}
