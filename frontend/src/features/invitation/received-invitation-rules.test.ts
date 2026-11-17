import { describe, expect, it } from '@jest/globals';
import { AxiosError, AxiosHeaders } from 'axios';

import { acceptProblem, expiresLabel, receivedView } from './received-invitation-rules';
import type { ReceivedTripInvitation } from './types';

function invitation(patch: Partial<ReceivedTripInvitation>): ReceivedTripInvitation {
  return {
    id: 'i',
    trip: { id: 't', title: '부산', startDate: null, endDate: null, memberCount: 2 },
    inviter: {
      id: 'u',
      nickname: '민지',
      profileImageUrl: null,
      accountVisibility: 'PUBLIC',
      followingStatus: 'ACCEPTED',
      followedByStatus: 'ACCEPTED',
    },
    status: 'PENDING',
    alreadyMember: false,
    expiresAt: '2026-11-24T10:00:00Z',
    createdAt: '2026-11-17T10:00:00Z',
    ...patch,
  };
}

function apiError(status: number, code: string) {
  const headers = new AxiosHeaders();
  return new AxiosError('x', String(status), { headers }, null, {
    status,
    statusText: '',
    headers,
    config: { headers },
    data: { error: { code, message: '', fields: [], traceId: '' } },
  });
}

describe('receivedView', () => {
  it('이미 동행이면 상태와 상관없이 member', () => {
    expect(receivedView(invitation({ alreadyMember: true, status: 'ACCEPTED' }))).toBe('member');
  });
  it('상태별 화면', () => {
    expect(receivedView(invitation({ status: 'PENDING' }))).toBe('pending');
    expect(receivedView(invitation({ status: 'EXPIRED' }))).toBe('expired');
    expect(receivedView(invitation({ status: 'CANCELED' }))).toBe('closed');
    expect(receivedView(invitation({ status: 'DECLINED' }))).toBe('closed');
    expect(receivedView(invitation({ status: 'ACCEPTED' }))).toBe('closed');
  });
});

describe('acceptProblem', () => {
  it('오류 코드를 화면 상태로 바꾼다', () => {
    expect(acceptProblem(apiError(409, 'TRIP_FULL'))).toBe('full');
    expect(acceptProblem(apiError(410, 'INVITATION_EXPIRED'))).toBe('expired');
    expect(acceptProblem(apiError(410, 'INVITATION_REVOKED'))).toBe('closed');
    expect(acceptProblem(apiError(404, 'FRIEND_INVITATION_NOT_FOUND'))).toBe('notFound');
    expect(acceptProblem(apiError(500, 'INTERNAL_ERROR'))).toBeNull();
    expect(acceptProblem(new Error('x'))).toBeNull();
  });
});

describe('expiresLabel', () => {
  it('서울 날짜로 보여 준다', () => {
    expect(expiresLabel('2026-11-24T16:00:00Z')).toBe('11.25까지');
  });
});
