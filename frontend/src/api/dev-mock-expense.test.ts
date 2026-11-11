import { describe, expect, it, jest } from '@jest/globals';
import type { InternalAxiosRequestConfig } from 'axios';

import { devMockAdapter } from './dev-mock';

jest.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://test', devMockNewUser: false } }));

const get = async (url: string, params: Record<string, unknown> = {}) => {
  const res = await devMockAdapter({
    method: 'get',
    url,
    headers: {},
    params,
  } as unknown as InternalAxiosRequestConfig);
  return res.data as Record<string, unknown>;
};

/**
 * 테스트 모드에서 여행 메뉴의 경비 화면이 열리는가(2026-11-11 여행 메뉴 조사).
 * 경비 화면은 여행, 동행 목록, 지출, 정산 네 가지를 받는다. 하나라도 답이 없으면 "경비를 불러오지 못했어요"가 된다
 */
describe('테스트 모드 경비 화면이 받는 것', () => {
  it.each(['trip-1', 'trip-4', 'trip-9'])('%s: 네 요청이 모두 답한다', async (tripId) => {
    const results = await Promise.allSettled([
      get(`/trips/${tripId}`),
      get(`/trips/${tripId}/members`, { includeInactive: true }),
      get(`/trips/${tripId}/expenses`, { limit: 100 }),
      get(`/trips/${tripId}/settlement`),
    ]);
    expect(results.map((r) => r.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'fulfilled',
      'fulfilled',
    ]);
  });

  it('동행 목록은 members 배열로 온다', async () => {
    const res = (await get('/trips/trip-1/members', { includeInactive: true })) as {
      data: { members: unknown[] };
    };
    expect(res.data.members.length).toBeGreaterThan(0);
  });
});
