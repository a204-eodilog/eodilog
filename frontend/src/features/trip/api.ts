import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse } from '@/api/types';

import type {
  CreateTripBody,
  InvitationSecret,
  JobRef,
  LeaveResult,
  Region,
  RegionDetail,
  Trip,
  UpdateTripBody,
} from './types';

const PAGE_SIZE = 20;
/** 여행 탭은 묶기 전에 모두 받아야 하므로 서버 최대치로 받는다. 보통 요청 1번이면 끝난다 */
const MY_TRIPS_LIMIT = 100;

/** 내가 참여 중인 여행. 서버는 만든 순서(최신부터)로 준다 */
export async function getMyTrips(cursor?: string | null): Promise<PageResponse<Trip>> {
  const { data } = await apiClient.get<PageResponse<Trip>>('/me/trips', {
    params: { limit: MY_TRIPS_LIMIT, ...(cursor ? { cursor } : {}) },
  });
  return data;
}

export async function getTrip(tripId: string): Promise<Trip> {
  const { data } = await apiClient.get<DataResponse<Trip>>(`/trips/${tripId}`);
  return data.data;
}

/** 같은 키로 다시 보내면 서버가 처음 결과를 돌려준다. 키는 src/api/idempotency.ts로 만든다 */
export async function createTrip(body: CreateTripBody, idempotencyKey: string): Promise<Trip> {
  const { data } = await apiClient.post<DataResponse<Trip>>('/trips', body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return data.data;
}

/** 이름 부분 일치. query는 1자 이상 */
export async function searchRegions(
  query: string,
  cursor?: string | null,
): Promise<PageResponse<Region>> {
  const { data } = await apiClient.get<PageResponse<Region>>('/regions', {
    params: { query, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
  });
  return data;
}

export async function getRegion(regionId: string): Promise<Region> {
  const { data } = await apiClient.get<DataResponse<RegionDetail>>(`/regions/${regionId}`);
  return data.data.region;
}

/**
 * 여행 나가기. 경비는 남고, 방장이면 가장 먼저 참여한 동행에게 넘어간다.
 * 혼자 남은 사람이 나가면 여행이 지워진다(202, tripDeleted true).
 * 사진 지우기는 사진 기능 전이라 true를 보내면 400이다.
 * 메시지 지우기는 받는다. 지울 메시지가 있으면 LEAVE_CLEANUP 작업을 만들고 202다.
 */
export async function leaveTrip(
  tripId: string,
  body: { deleteOwnPhotos: boolean; deleteOwnMessages: boolean; expectedVersion: number },
): Promise<LeaveResult> {
  const { data } = await apiClient.post<DataResponse<LeaveResult>>(`/trips/${tripId}/leave`, body);
  return data.data;
}

/**
 * 초대 링크 만들기. 참여 중인 사람 누구나 만든다. 새로 만들면 같은 여행의 이전 링크는 무효가 된다.
 * 서버는 url을 다시 알려 주지 않으므로 화면에 들어올 때 부르지 않는다(명세 FR-002)
 */
export async function createInvitation(tripId: string): Promise<InvitationSecret> {
  const { data } = await apiClient.post<DataResponse<InvitationSecret>>(
    `/trips/${tripId}/invitations`,
  );
  return data.data;
}

/** 이 여행에서 지금 쓸 수 있는 초대 링크를 무효로 한다. 쓸 수 있는 링크가 없어도 204 */
export async function cancelInvitations(tripId: string): Promise<void> {
  await apiClient.delete(`/trips/${tripId}/invitations`);
}

/** 이름·기간·여행지 수정. 참여 중인 사람 누구나. 바뀐 칸만 보낸다 */
export async function updateTrip(tripId: string, body: UpdateTripBody): Promise<Trip> {
  const { data } = await apiClient.patch<DataResponse<Trip>>(`/trips/${tripId}`, body);
  return data.data;
}

/** 방장 넘기기. 방장만. targetMemberId는 사용자 id가 아니라 멤버 id다 */
export async function transferOwner(
  tripId: string,
  body: { targetMemberId: string; expectedVersion: number },
): Promise<Trip> {
  const { data } = await apiClient.post<DataResponse<Trip>>(
    `/trips/${tripId}/owner-transfer`,
    body,
  );
  return data.data;
}

/** 동행 내보내기. 방장만. 204 */
export async function removeMember(
  tripId: string,
  memberId: string,
  expectedVersion: number,
): Promise<void> {
  await apiClient.delete(`/trips/${tripId}/members/${memberId}`, { params: { expectedVersion } });
}

/** 여행 삭제. 방장만. 모든 동행에게서 즉시 사라지고 남은 자료는 서버 작업이 지운다(202) */
export async function deleteTrip(tripId: string, expectedVersion: number): Promise<JobRef> {
  const { data } = await apiClient.delete<DataResponse<JobRef>>(`/trips/${tripId}`, {
    params: { expectedVersion },
  });
  return data.data;
}
