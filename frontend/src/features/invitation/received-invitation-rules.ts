import { isAxiosError } from 'axios';
import type { Href } from 'expo-router';

import type { ApiErrorBody } from '@/api/types';
import { seoulToday } from '@/lib/seoul-date';

import type { ReceivedTripInvitation } from './types';

/**
 * 받은 초대 화면 상태.
 * member 이미 동행, pending 수락·거절 가능, expired 기간 지남, closed 취소·거절·이미 쓴 초대
 */
export type ReceivedView = 'member' | 'pending' | 'expired' | 'closed';

export function receivedView(invitation: ReceivedTripInvitation): ReceivedView {
  if (invitation.alreadyMember) return 'member';
  switch (invitation.status) {
    case 'PENDING':
      return 'pending';
    case 'EXPIRED':
      return 'expired';
    default:
      return 'closed';
  }
}

/** 수락 실패를 화면 상태로. 409 full, 410 만료·무효, 404 찾을 수 없음, 그 밖은 null(다시 시도) */
export type AcceptProblem = 'full' | 'expired' | 'closed' | 'notFound' | null;

export function acceptProblem(error: unknown): AcceptProblem {
  if (!isAxiosError<ApiErrorBody>(error) || !error.response) return null;
  const { status, data } = error.response;
  const code = data?.error?.code;
  if (status === 409 && code === 'TRIP_FULL') return 'full';
  if (status === 410) return code === 'INVITATION_REVOKED' ? 'closed' : 'expired';
  if (status === 404) return 'notFound';
  return null;
}

/** "11.24까지" 서울 기준 만료 날짜 */
export function expiresLabel(expiresAt: string): string {
  return `${seoulToday(new Date(expiresAt)).slice(5).replace('-', '.')}까지`;
}

/** 받은 초대 화면 주소 */
export function receivedInvitationHref(id: string): Href {
  return { pathname: '/trip-invitations/[invitationId]', params: { invitationId: id } };
}
