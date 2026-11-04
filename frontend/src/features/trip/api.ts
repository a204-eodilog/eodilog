import { apiClient } from '@/api/client';
import type { DataResponse } from '@/api/types';

import type { LeaveResult } from './types';

/**
 * 여행 나가기. 경비는 남고, 방장이면 가장 먼저 참여한 동행에게 넘어간다.
 * 혼자 남은 사람이 나가면 여행이 지워진다(202, tripDeleted true).
 * 사진·메시지 지우기는 서버 정리 작업이 생기기 전까지 true를 보내면 400이다.
 */
export async function leaveTrip(
  tripId: string,
  body: { deleteOwnPhotos: boolean; deleteOwnMessages: boolean; expectedVersion: number },
): Promise<LeaveResult> {
  const { data } = await apiClient.post<DataResponse<LeaveResult>>(`/trips/${tripId}/leave`, body);
  return data.data;
}
