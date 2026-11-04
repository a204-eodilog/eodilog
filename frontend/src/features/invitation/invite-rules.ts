import { isAxiosError } from 'axios';
import type { Href } from 'expo-router';

import type { ApiErrorBody, TripStatus } from '@/api/types';
import { parseDate } from '@/lib/format-date';

/** 한 여행에 함께할 수 있는 최대 인원(방장 포함, 결정 Q-4) */
export const TRIP_MAX_MEMBERS = 20;

/**
 * 초대 링크가 왜 안 되는지. S04 상태와 맞춘다.
 * unusable: 없는·만료·무효 링크(404, 410) → "초대 링크를 쓸 수 없어요"
 * full: 정원 초과(409 TRIP_FULL) → "여행 인원이 가득 찼어요"
 * null: 그 밖의 오류. 다시 시도할 수 있다
 */
export type InvitationProblem = 'unusable' | 'full' | null;

export function invitationProblem(error: unknown): InvitationProblem {
  if (!isAxiosError<ApiErrorBody>(error) || !error.response) return null;
  const { status, data } = error.response;
  if (status === 404 || status === 410) return 'unusable';
  if (status === 409 && data?.error?.code === 'TRIP_FULL') return 'full';
  return null;
}

/**
 * 미리보기에는 상태가 없어 기간으로 짐작한다. 서버 규칙과 같다(날짜 미정은 계획 중).
 * today는 테스트에서만 넣는다
 */
export function guessTripStatus(
  startDate: string | null,
  endDate: string | null,
  today: Date = new Date(),
): TripStatus {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) return 'PLANNING';
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (day < start.getTime()) return 'PLANNING';
  if (day > end.getTime()) return 'COMPLETED';
  return 'ONGOING';
}

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  PLANNING: '계획 중',
  ONGOING: '여행 중',
  COMPLETED: '다녀옴',
};

/** S04 초대 참여 확인 주소. first는 S02에서 막 가입하고 온 경우(참여 뒤 S03 취향 입력으로) */
export function inviteHref(token: string, options?: { first?: boolean }): Href {
  return {
    pathname: '/invitations/[token]',
    params: options?.first ? { token, first: '1' } : { token },
  };
}

/** 여행 상세(S17). 아직 화면이 없어 홈으로 보낸다. S17이 생기면 /trips/[tripId]로 바꾼다 */
export function tripHref(_tripId: string): Href {
  return '/home';
}
