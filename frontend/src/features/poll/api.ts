import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse } from '@/api/types';

import type {
  CandidateInput,
  CreatePollBody,
  Place,
  Poll,
  SavedPlace,
  SavedPlacePage,
} from './types';

// 계약: specs/20261109-094657-poll-vote/contracts/poll-api.md (백엔드 PollController 기준)
// 투표 API는 Idempotency-Key를 요구하지 않는다. 두 번 누르기는 화면에서 막는다
// 직접 종료: 백엔드 전달 문서 to-FE-poll-manual-close-2026-11-16 (EODI-360)

/** S22가 대표 투표를 고를 때 보는 최근 투표 수 */
export const POLLS_PAGE_LIMIT = 20;
/** 그룹 즐겨찾기는 후보 출처라 서버 최대치로 받아 요청 수를 줄인다 */
const SAVED_PLACES_LIMIT = 100;

/** GET /trips/{tripId}/polls 첫 쪽. 최근 생성 순이고 마감 시각이 지난 투표는 서버가 먼저 마감한다 */
export async function getPolls(tripId: string, signal?: AbortSignal): Promise<Poll[]> {
  const { data } = await apiClient.get<PageResponse<Poll>>(`/trips/${tripId}/polls`, {
    params: { limit: POLLS_PAGE_LIMIT },
    signal,
  });
  return data.data;
}

/** GET /trips/{tripId}/polls/{pollId}. 없거나 다른 여행이면 404 POLL_NOT_FOUND, 볼 수 없는 여행이면 404 TRIP_NOT_FOUND */
export async function getPoll(tripId: string, pollId: string, signal?: AbortSignal): Promise<Poll> {
  const { data } = await apiClient.get<DataResponse<Poll>>(`/trips/${tripId}/polls/${pollId}`, {
    signal,
  });
  return data.data;
}

/** POST /trips/{tripId}/polls. 제목 1~200자, 후보 1~30개, 마감은 미래이고 30일 이내 */
export async function createPoll(tripId: string, body: CreatePollBody): Promise<Poll> {
  const { data } = await apiClient.post<DataResponse<Poll>>(`/trips/${tripId}/polls`, body);
  return data.data;
}

/**
 * PUT .../ballot. 내 선택 전체 교체, 빈 배열이면 취소.
 * 마감이면 409 POLL_CLOSED, 후보가 추가돼 version이 다르면 409 VERSION_CONFLICT
 */
export async function replaceBallot(
  tripId: string,
  pollId: string,
  candidateIds: string[],
  expectedVersion: number,
): Promise<Poll> {
  const { data } = await apiClient.put<DataResponse<Poll>>(
    `/trips/${tripId}/polls/${pollId}/ballot`,
    { candidateIds, expectedVersion },
  );
  return data.data;
}

/**
 * POST .../close. 투표를 연 사람이 마감 시각 전에 직접 끝낸다. 마감된 투표가 돌아온다(version +1).
 * 연 사람이 아니면 403, 이미 마감이면 409 POLL_CLOSED, 그사이 후보가 추가됐으면 409 VERSION_CONFLICT
 */
export async function closePoll(
  tripId: string,
  pollId: string,
  expectedVersion: number,
): Promise<Poll> {
  const { data } = await apiClient.post<DataResponse<Poll>>(
    `/trips/${tripId}/polls/${pollId}/close`,
    { expectedVersion },
  );
  return data.data;
}

/** POST .../candidates. 진행 중에만, 이미 있는 후보와 30개 넘김은 400 candidate */
export async function addCandidate(
  tripId: string,
  pollId: string,
  candidate: CandidateInput,
  expectedVersion: number,
): Promise<Poll> {
  const { data } = await apiClient.post<DataResponse<Poll>>(
    `/trips/${tripId}/polls/${pollId}/candidates`,
    { candidate, expectedVersion },
  );
  return data.data;
}

/** GET /places/{placeId}. 장소 투표 후보 이름을 찾는다 */
export async function getPlace(placeId: string, signal?: AbortSignal): Promise<Place> {
  const { data } = await apiClient.get<DataResponse<Place>>(`/places/${placeId}`, { signal });
  return data.data;
}

/**
 * GET /trips/{tripId}/saved-places?filter=ALL 끝까지. 응답은 DataResponse로 감싸지 않은 {items, totals, page}다.
 * N8과 후보 추가 시트의 후보 출처라 모두 받는다
 */
export async function getTripSavedPlaces(
  tripId: string,
  signal?: AbortSignal,
): Promise<SavedPlace[]> {
  const items: SavedPlace[] = [];
  let cursor: string | null = null;
  do {
    const { data }: { data: SavedPlacePage } = await apiClient.get(
      `/trips/${tripId}/saved-places`,
      {
        params: { filter: 'ALL', limit: SAVED_PLACES_LIMIT, ...(cursor ? { cursor } : {}) },
        signal,
      },
    );
    items.push(...data.items);
    cursor = data.page.hasNext ? data.page.nextCursor : null;
  } while (cursor);
  return items;
}
