import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse } from '@/api/types';
import type { InvitableFriends, SendFriendInvitationsResponse } from '@/features/invitation/types';

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

/**
 * 그룹 즐겨찾기에 모은 장소 수. 여행 상세의 단계(장소 모으기)를 실제 진행에 맞추는 데만 쓴다.
 * 목록은 필요 없어 한 건만 받고 totals를 읽는다. 응답은 DataResponse로 감싸지 않은 {items, totals, page}다
 */
export async function getSavedPlaceCount(tripId: string, signal?: AbortSignal): Promise<number> {
  const { data } = await apiClient.get<{ totals: { allPlaceCount: number } }>(
    `/trips/${tripId}/saved-places`,
    { params: { filter: 'ALL', limit: 1 }, signal },
  );
  return data.totals.allPlaceCount;
}

/** 이 여행에 초대할 수 있는 맞팔 친구. 여행의 ACTIVE 멤버만 */
export async function getInvitableFriends(
  tripId: string,
  signal?: AbortSignal,
): Promise<InvitableFriends> {
  const { data } = await apiClient.get<DataResponse<InvitableFriends>>(
    `/trips/${tripId}/invitable-friends`,
    { signal },
  );
  return data.data;
}

/** 맞팔 친구에게 앱 안에서 초대를 보낸다. 사람마다 결과가 따로 온다. 정원이 차면 409 TRIP_FULL */
export async function sendFriendInvitations(
  tripId: string,
  inviteeUserIds: string[],
): Promise<SendFriendInvitationsResponse> {
  const { data } = await apiClient.post<DataResponse<SendFriendInvitationsResponse>>(
    `/trips/${tripId}/friend-invitations`,
    { inviteeUserIds },
  );
  return data.data;
}

/** 보낸 앱 내 초대 취소. 이미 처리된 초대여도 204 */
export async function cancelFriendInvitation(tripId: string, invitationId: string): Promise<void> {
  await apiClient.delete(`/trips/${tripId}/friend-invitations/${invitationId}`);
}
