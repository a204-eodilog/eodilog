import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';

import { deleteVisit } from '../api';
import type { Visit } from '../types';

import { visitKeys } from './use-visit-board';
import { undoVisitOptions } from './use-visit-mutations';

// api.ts가 axios 인스턴스를 만들어서, 지우기만 가짜로 바꿔 둔다
jest.mock('../api', () => ({ deleteVisit: jest.fn() }));
const mockDelete = deleteVisit as jest.MockedFunction<typeof deleteVisit>;

const TRIP = 't1';
const KEY = visitKeys.myVisits(TRIP);
const VISIT: Visit = {
  id: 'v1',
  tripId: TRIP,
  memberId: 'me',
  placeId: 'p1',
  visitedAt: '2026-11-14T01:00:00Z',
  evidenceType: 'MANUAL',
  reviewId: null,
  reviewScore: null,
};

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

let queryClient: QueryClient;
let unsubscribe: () => void;

/** 화면이 내 방문 목록을 보고 있는 상태. 다시 읽기는 연결이 끊겨 늘 실패한다 */
beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(KEY, [VISIT]);
  const observer = new QueryObserver(queryClient, {
    queryKey: KEY,
    queryFn: () => Promise.reject(new Error('network')),
    staleTime: Infinity,
  });
  unsubscribe = observer.subscribe(() => {});
});

afterEach(() => {
  unsubscribe();
  queryClient.clear();
  mockDelete.mockReset();
});

async function undo() {
  const mutation = new MutationObserver(queryClient, undoVisitOptions(queryClient, TRIP));
  await mutation.mutate(VISIT).catch(() => undefined);
  // onSettled의 다시 읽기가 끝날 때까지 기다린다
  await queryClient.refetchQueries({ queryKey: KEY }).catch(() => undefined);
}

it('지우기와 다시 읽기가 모두 실패하면 뺀 방문을 다시 넣는다', async () => {
  mockDelete.mockRejectedValue(new Error('network'));
  await undo();
  expect(queryClient.getQueryData(KEY)).toEqual([VISIT]);
});

it('이미 해제된 방문(404)은 되돌린 것으로 보고 다시 넣지 않는다', async () => {
  mockDelete.mockRejectedValue(apiError(404, 'VISIT_NOT_FOUND'));
  await undo();
  expect(queryClient.getQueryData(KEY)).toEqual([]);
});

it('지우기에 성공하면 목록에서 빠진다', async () => {
  mockDelete.mockResolvedValue(undefined);
  await undo();
  expect(queryClient.getQueryData(KEY)).toEqual([]);
});
