import { describe, expect, it } from '@jest/globals';
import { AxiosError, type AxiosResponse } from 'axios';

import { guessTripStatus, invitationProblem } from './invite-rules';

function httpError(status: number, code?: string) {
  const response = {
    status,
    data: code ? { error: { code, message: code } } : undefined,
  } as AxiosResponse;
  return new AxiosError('fail', undefined, undefined, undefined, response);
}

describe('invitationProblem', () => {
  it('없는·만료·무효 링크는 unusable', () => {
    expect(invitationProblem(httpError(404))).toBe('unusable');
    expect(invitationProblem(httpError(410, 'INVITATION_EXPIRED'))).toBe('unusable');
    expect(invitationProblem(httpError(410, 'INVITATION_REVOKED'))).toBe('unusable');
  });

  it('정원 초과는 full', () => {
    expect(invitationProblem(httpError(409, 'TRIP_FULL'))).toBe('full');
  });

  it('다른 409나 네트워크 오류는 다시 시도할 수 있는 null', () => {
    expect(invitationProblem(httpError(409, 'VERSION_CONFLICT'))).toBeNull();
    expect(invitationProblem(httpError(500))).toBeNull();
    expect(invitationProblem(new Error('offline'))).toBeNull();
  });
});

describe('guessTripStatus', () => {
  const today = new Date(2026, 10, 14);

  it('날짜가 없으면 계획 중', () => {
    expect(guessTripStatus(null, null, today)).toBe('PLANNING');
  });

  it('기간으로 계획 중·여행 중·다녀옴을 가른다', () => {
    expect(guessTripStatus('2026-11-20', '2026-11-21', today)).toBe('PLANNING');
    expect(guessTripStatus('2026-11-14', '2026-11-15', today)).toBe('ONGOING');
    expect(guessTripStatus('2026-11-01', '2026-11-02', today)).toBe('COMPLETED');
  });
});
