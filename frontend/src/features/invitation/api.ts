import { apiClient } from '@/api/client';
import type { DataResponse, Trip } from '@/api/types';

import type { InvitationPreview, ReceivedTripInvitation } from './types';

/** 초대 링크 미리보기. 형식이 틀린 토큰 404, 쓸 수 없는 링크 410(INVITATION_EXPIRED·INVITATION_REVOKED) */
export async function getInvitationPreview(token: string): Promise<InvitationPreview> {
  const { data } = await apiClient.get<DataResponse<InvitationPreview>>(
    `/invitations/${encodeURIComponent(token)}`,
  );
  return data.data;
}

/**
 * 초대 링크로 여행에 참여한다. 팔로우 관계 없이 누구나(결정 Q-4).
 * 이미 동행이면 같은 여행을 그대로 준다. 정원(방장 포함 20명)이 차면 409 TRIP_FULL
 */
export async function acceptInvitation(token: string): Promise<Trip> {
  const { data } = await apiClient.post<DataResponse<Trip>>(
    `/invitations/${encodeURIComponent(token)}/accept`,
  );
  return data.data;
}

/** 받은 앱 내 여행 초대 중 지금 수락할 수 있는 것. 최신순 */
export async function getReceivedTripInvitations(
  signal?: AbortSignal,
): Promise<ReceivedTripInvitation[]> {
  const { data } = await apiClient.get<DataResponse<ReceivedTripInvitation[]>>(
    '/me/trip-invitations',
    { signal },
  );
  return data.data;
}

/** 받은 초대 하나. 만료·취소·거절도 410 대신 status로 온다. 남의 초대·삭제된 여행은 404 */
export async function getReceivedTripInvitation(
  id: string,
  signal?: AbortSignal,
): Promise<ReceivedTripInvitation> {
  const { data } = await apiClient.get<DataResponse<ReceivedTripInvitation>>(
    `/me/trip-invitations/${id}`,
    { signal },
  );
  return data.data;
}

/** 받은 초대 수락. 409 TRIP_FULL, 410 INVITATION_EXPIRED·INVITATION_REVOKED */
export async function acceptTripInvitation(id: string): Promise<Trip> {
  const { data } = await apiClient.post<DataResponse<Trip>>(`/me/trip-invitations/${id}/accept`);
  return data.data;
}

/** 받은 초대 거절. 초대한 사람에게 알리지 않는다 */
export async function declineTripInvitation(id: string): Promise<void> {
  await apiClient.post(`/me/trip-invitations/${id}/decline`);
}
