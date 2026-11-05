import { apiClient } from '@/api/client';
import type { DataResponse, MyProfile, PageResponse } from '@/api/types';

import type { ItineraryItem, Review, ReviewInput, Visit, VisitTrip } from './types';

/** 서버 최대 페이지 크기. 한 여행의 내 방문은 많지 않아 끝까지 읽는다 */
const PAGE_LIMIT = 100;

export async function getMe(): Promise<MyProfile> {
  const { data } = await apiClient.get<DataResponse<MyProfile>>('/me');
  return data.data;
}

export async function getVisitTrip(tripId: string): Promise<VisitTrip> {
  const { data } = await apiClient.get<DataResponse<VisitTrip>>(`/trips/${tripId}`);
  return data.data;
}

/** 여행의 현재 코스. 새 여행은 빈 코스다 */
export async function getItineraryItems(tripId: string): Promise<ItineraryItem[]> {
  const { data } = await apiClient.get<DataResponse<{ items: ItineraryItem[] }>>(
    `/trips/${tripId}/itinerary`,
  );
  return data.data.items;
}

/** 내 방문 전부(memberId를 보내지 않으면 나). 체크를 해제한 방문은 서버가 뺀다 */
export async function getMyVisits(tripId: string): Promise<Visit[]> {
  const all: Visit[] = [];
  let cursor: string | null = null;
  do {
    const { data }: { data: PageResponse<Visit> } = await apiClient.get(`/trips/${tripId}/visits`, {
      params: { limit: PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
    });
    all.push(...data.data);
    cursor = data.page.hasNext ? data.page.nextCursor : null;
  } while (cursor);
  return all;
}

/**
 * '다녀옴' 직접 체크. 같은 장소를 다시 보내면 서버가 기존 방문을 돌려줘서 Idempotency-Key가 필요 없다.
 * visitedAt은 지금보다 미래면 400이다
 */
export async function createManualVisit(
  tripId: string,
  placeId: string,
  visitedAt: string,
): Promise<Visit> {
  const { data } = await apiClient.post<DataResponse<Visit>>(`/trips/${tripId}/visits`, {
    placeId,
    visitedAt,
    evidenceType: 'MANUAL',
  });
  return data.data;
}

/** 체크 해제. 본인 방문만. 이미 해제했으면 404 VISIT_NOT_FOUND */
export async function deleteVisit(tripId: string, visitId: string): Promise<void> {
  await apiClient.delete(`/trips/${tripId}/visits/${visitId}`);
}

/** 여행의 평가 전부(동행 평가 포함, 나간 멤버의 평가도 남는다). 최근 쓴 순 */
export async function getTripReviews(tripId: string): Promise<Review[]> {
  const all: Review[] = [];
  let cursor: string | null = null;
  do {
    const { data }: { data: PageResponse<Review> } = await apiClient.get(
      `/trips/${tripId}/reviews`,
      { params: { limit: PAGE_LIMIT, ...(cursor ? { cursor } : {}) } },
    );
    all.push(...data.data);
    cursor = data.page.hasNext ? data.page.nextCursor : null;
  } while (cursor);
  return all;
}

/**
 * 평가 쓰기·고치기. 처음이면 만들고 있으면 고친다(둘 다 200).
 * 고칠 때 조회한 version을 보내면, 그 사이 바뀌었을 때 409 VERSION_CONFLICT
 */
export async function saveReview(
  tripId: string,
  visitId: string,
  input: ReviewInput,
): Promise<Review> {
  const { data } = await apiClient.put<DataResponse<Review>>(
    `/trips/${tripId}/visits/${visitId}/review`,
    input,
  );
  return data.data;
}

/** 평가 삭제. 물리 삭제라 다시 쓰면 새 평가다. 이미 없으면 404 REVIEW_NOT_FOUND */
export async function deleteReview(tripId: string, visitId: string): Promise<void> {
  await apiClient.delete(`/trips/${tripId}/visits/${visitId}/review`);
}
