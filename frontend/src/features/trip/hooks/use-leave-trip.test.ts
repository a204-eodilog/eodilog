import { beforeEach, expect, it, jest } from '@jest/globals';
import { AxiosError, AxiosHeaders } from 'axios';

import { leaveTrip } from '../api';

import { leaveTripFailure, leaveTripOrGone } from './use-leave-trip';

jest.mock('../api', () => ({ leaveTrip: jest.fn() }));

const mockLeaveTrip = jest.mocked(leaveTrip);

function apiError(status: number, code: string) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('fail', undefined, config, undefined, {
    status,
    statusText: '',
    headers: {},
    config,
    data: { error: { code, message: '' } },
  });
}

const input = {
  tripId: 't1',
  expectedVersion: 3,
  deleteOwnPhotos: false,
  deleteOwnMessages: false,
};

beforeEach(() => {
  mockLeaveTrip.mockReset();
});

it('나가기에 성공하면 서버 결과를 그대로 돌려준다', async () => {
  const result = {
    tripId: 't1',
    tripDeleted: false,
    newOwnerMemberId: null,
    cleanupJobId: null,
    status: 'LEFT' as const,
  };
  mockLeaveTrip.mockResolvedValue(result);

  await expect(leaveTripOrGone(input)).resolves.toEqual(result);
  expect(mockLeaveTrip).toHaveBeenCalledWith('t1', {
    expectedVersion: 3,
    deleteOwnPhotos: false,
    deleteOwnMessages: false,
  });
});

it('이미 나간 여행(404 TRIP_NOT_FOUND)은 실패가 아니라 null이다', async () => {
  mockLeaveTrip.mockRejectedValue(apiError(404, 'TRIP_NOT_FOUND'));

  await expect(leaveTripOrGone(input)).resolves.toBeNull();
});

it('그 밖의 오류는 그대로 실패한다', async () => {
  const error = apiError(409, 'VERSION_CONFLICT');
  mockLeaveTrip.mockRejectedValue(error);

  await expect(leaveTripOrGone(input)).rejects.toBe(error);
});

it('VERSION_CONFLICT만 conflict, 나머지는 error로 나눈다', () => {
  expect(leaveTripFailure(apiError(409, 'VERSION_CONFLICT'))).toBe('conflict');
  expect(leaveTripFailure(apiError(500, 'INTERNAL_ERROR'))).toBe('error');
  expect(leaveTripFailure(new Error('network'))).toBe('error');
});
