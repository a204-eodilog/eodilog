import { apiClient } from '@/api/client';
import type { DataResponse } from '@/api/types';

import type { ChecklistSummary, JobRef, Weather } from './types';

// 계약: specs/20261109-145938-on-trip-weather/contracts/routes.md
// 날씨와 날씨 대안 API는 2026-11-10 dev에 들어왔다. 테스트 모드 가짜 서버도 같은 형식으로 답한다

/** GET /trips/{tripId}/weather. 그 날 그 장소의 날씨 */
export async function getWeather(
  tripId: string,
  date: string,
  placeId: string,
  signal?: AbortSignal,
): Promise<Weather> {
  const { data } = await apiClient.get<DataResponse<Weather>>(`/trips/${tripId}/weather`, {
    params: { date, placeId },
    signal,
  });
  return data.data;
}

/** POST /trips/{tripId}/weather-alternatives. 결과는 GET /jobs/{jobId}의 result */
export async function requestWeatherAlternatives(
  tripId: string,
  body: { date: string; placeId: string; expectedVersion: number },
  /** 서버 필수. 없으면 400 VALIDATION_ERROR */
  idempotencyKey: string,
): Promise<JobRef> {
  const { data } = await apiClient.post<DataResponse<JobRef>>(
    `/trips/${tripId}/weather-alternatives`,
    body,
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return data.data;
}

/** 고른 날씨 대안으로 변경안을 만든다. 결과는 GET .../itinerary/proposals/{jobId} */
export async function requestWeatherProposal(
  tripId: string,
  body: { expectedVersion: number; sourceWeatherJobId: string; selectedAlternativeId: string },
  /** 서버 필수. 같은 키와 같은 본문이면 처음 받은 작업을 그대로 돌려준다 */
  idempotencyKey: string,
): Promise<JobRef> {
  const { data } = await apiClient.post<DataResponse<JobRef>>(
    `/trips/${tripId}/itinerary/proposals`,
    { reason: 'WEATHER', ...body },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return data.data;
}

/** 준비물 수만 센다. 준비물 화면은 다른 브랜치에 있어 목록 API를 직접 부른다(Q-10-5) */
export async function getChecklistSummary(
  tripId: string,
  signal?: AbortSignal,
): Promise<ChecklistSummary> {
  const { data } = await apiClient.get<DataResponse<{ items: { checked: boolean }[] }>>(
    `/trips/${tripId}/checklist`,
    { signal },
  );
  const items = data.data.items;
  return { total: items.length, checked: items.filter((i) => i.checked).length };
}

/** POST /trips/{tripId}/checklist. 대안이 없을 때 우산·우비를 넣는다 */
export async function addChecklistItem(tripId: string, label: string): Promise<void> {
  await apiClient.post(`/trips/${tripId}/checklist`, { label });
}
