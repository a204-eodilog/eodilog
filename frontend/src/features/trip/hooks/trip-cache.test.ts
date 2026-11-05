import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';

import { dropFromTripLists, forgetTrip, invalidateTripLists } from './trip-cache';

jest.mock('expo-router', () => ({
  router: { canDismiss: () => false, dismissAll: jest.fn(), navigate: jest.fn() },
}));
jest.mock('../invite-storage', () => ({ forgetInviteLink: jest.fn() }));
// 서버 주소 설정 없이 돌도록 API 모듈은 비워 둔다
jest.mock('../api', () => ({ getTrip: jest.fn() }));

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['trips', 't1'], { id: 't1' });
  queryClient.setQueryData(['trips', 't1', 'expenses'], []);
  queryClient.setQueryData(['trips', 't1', 'invite'], { url: 'x' });
  queryClient.setQueryData(['trips', 't2'], { id: 't2' });
  queryClient.setQueryData(['trips', 'mine'], { pages: [] });
  queryClient.setQueryData(['me', 'trips'], []);
});

describe('forgetTrip', () => {
  it('그 여행으로 시작하는 캐시를 모두 지우고 다른 여행과 목록은 남긴다', async () => {
    await forgetTrip(queryClient, 't1');
    expect(queryClient.getQueryData(['trips', 't1'])).toBeUndefined();
    expect(queryClient.getQueryData(['trips', 't1', 'expenses'])).toBeUndefined();
    expect(queryClient.getQueryData(['trips', 't1', 'invite'])).toBeUndefined();
    expect(queryClient.getQueryData(['trips', 't2'])).toEqual({ id: 't2' });
    expect(queryClient.getQueryData(['trips', 'mine'])).toEqual({ pages: [] });
  });
});

describe('invalidateTripLists', () => {
  it('여행 탭 목록과 N4 목록을 모두 새로 받게 한다', async () => {
    await invalidateTripLists(queryClient);
    expect(queryClient.getQueryState(['trips', 'mine'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['me', 'trips'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['trips', 't2'])?.isInvalidated).toBe(false);
  });
});

describe('dropFromTripLists', () => {
  it('여행 탭 목록과 N4 목록에서 그 여행만 바로 뺀다', async () => {
    queryClient.setQueryData(['trips', 'mine'], {
      pages: [
        { data: [{ id: 't1' }, { id: 't2' }], page: { nextCursor: 'c', hasNext: true } },
        { data: [{ id: 't3' }], page: { nextCursor: null, hasNext: false } },
      ],
      pageParams: [null, 'c'],
    });
    queryClient.setQueryData(['me', 'trips'], [{ id: 't1' }, { id: 't3' }]);

    await dropFromTripLists(queryClient, 't1');

    const mine = queryClient.getQueryData<{ pages: { data: { id: string }[] }[] }>([
      'trips',
      'mine',
    ]);
    expect(mine?.pages.map((p) => p.data.map((t) => t.id))).toEqual([['t2'], ['t3']]);
    expect(queryClient.getQueryData(['me', 'trips'])).toEqual([{ id: 't3' }]);
  });

  it('목록 캐시가 없으면 아무것도 만들지 않는다', async () => {
    queryClient.removeQueries({ queryKey: ['trips', 'mine'] });
    queryClient.removeQueries({ queryKey: ['me', 'trips'] });
    await dropFromTripLists(queryClient, 't1');
    expect(queryClient.getQueryData(['trips', 'mine'])).toBeUndefined();
    expect(queryClient.getQueryData(['me', 'trips'])).toBeUndefined();
  });
});
