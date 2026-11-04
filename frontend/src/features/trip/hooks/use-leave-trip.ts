import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import type { ApiErrorBody } from '@/api/types';

import { leaveTrip } from '../api';
import type { LeaveResult } from '../types';

type LeaveTripInput = {
  tripId: string;
  expectedVersion: number;
  deleteOwnPhotos: boolean;
  deleteOwnMessages: boolean;
};

/** 나가기 실패 종류. conflict면 그 사이 다른 동행이 여행을 바꾼 것이라 여행을 다시 불러와야 한다 */
export type LeaveTripFailure = 'conflict' | 'error';

function errorCode(error: unknown): string | undefined {
  if (!isAxiosError<ApiErrorBody>(error)) return undefined;
  return error.response?.data?.error?.code;
}

export function leaveTripFailure(error: unknown): LeaveTripFailure {
  return errorCode(error) === 'VERSION_CONFLICT' ? 'conflict' : 'error';
}

/**
 * 나가기를 보내고, 이미 나간 여행이면 null을 돌려준다.
 * 나가기는 멱등키 대상이 아니라 응답만 놓치고 다시 보내면 서버가 404 TRIP_NOT_FOUND로 답한다.
 * 명세(trip-members-leave 예외 상황)대로 실패로 보이지 않고 나간 것과 같이 여행 목록으로 보낸다.
 */
export async function leaveTripOrGone({
  tripId,
  ...body
}: LeaveTripInput): Promise<LeaveResult | null> {
  try {
    return await leaveTrip(tripId, body);
  } catch (error) {
    if (errorCode(error) === 'TRIP_NOT_FOUND') return null;
    throw error;
  }
}

/** 여행 나가기 요청. 여행 목록 새로고침과 화면 이동은 부르는 쪽에서 한다. 성공 값 null = 이미 나간 여행 */
export function useLeaveTrip() {
  return useMutation({ mutationFn: leaveTripOrGone });
}
