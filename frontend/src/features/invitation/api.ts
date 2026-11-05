import { apiClient } from '@/api/client';
import type { DataResponse, Trip } from '@/api/types';

import type { InvitationPreview } from './types';

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
