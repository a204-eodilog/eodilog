import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

import { getItinerary } from '../api';

import { itineraryItemsQuery, visitKeys } from './use-visit-board';

// api.ts가 axios 인스턴스를 만들어서, 코스 읽기만 가짜로 바꿔 둔다
jest.mock('../api', () => ({ getItinerary: jest.fn() }));
// 목록 훅이 쓰는 useMe(@/hooks/use-me)가 apiClient를 만들면서 환경 변수를 읽어서 함께 막아 둔다
jest.mock('@/api/client', () => ({ apiClient: {} }));
const mockGet = getItinerary as jest.MockedFunction<typeof getItinerary>;

const TRIP = 't1';
const ITEM = { id: 'i1', place: { id: 'p1', name: '안목해변' }, day: 1, order: 1, startTime: null };
/** 코스 화면이 같은 쿼리 키에 두는 모양: 서버가 준 코스 전체 */
const COURSE = {
  tripId: TRIP,
  version: 3,
  items: [ITEM],
  legs: [],
  updatedByMemberId: 'me',
  updatedAt: '2026-11-11T05:00:00Z',
};

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockGet.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

it('코스 화면이 먼저 받아 둔 코스 전체에서 항목 목록만 꺼내 쓴다', () => {
  queryClient.setQueryData(visitKeys.itinerary(TRIP), COURSE);
  const observer = new QueryObserver(queryClient, {
    ...itineraryItemsQuery(TRIP),
    staleTime: Infinity,
  });

  const { data } = observer.getCurrentResult();

  expect(Array.isArray(data)).toBe(true);
  expect(data).toEqual([ITEM]);
  expect(mockGet).not.toHaveBeenCalled();
});

it('평가 화면이 먼저 받아도 코스 화면이 읽는 모양(코스 전체)으로 둔다', async () => {
  mockGet.mockResolvedValue(COURSE);

  const items = await queryClient.fetchQuery(itineraryItemsQuery(TRIP));

  // fetchQuery는 select를 거치지 않는다. 캐시에는 서버가 준 코스 전체가 그대로 있다
  expect(items).toEqual(COURSE);
  const cached = queryClient.getQueryData<typeof COURSE>(visitKeys.itinerary(TRIP));
  expect(cached?.version).toBe(3);
  expect(cached?.items).toEqual([ITEM]);
});
