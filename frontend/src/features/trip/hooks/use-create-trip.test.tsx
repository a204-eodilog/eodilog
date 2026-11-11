import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createTrip } from '../api';
import type { Trip } from '../types';

import { useCreateTrip } from './use-create-trip';
import { tripKey } from './use-trip';

jest.mock('../api', () => ({ createTrip: jest.fn() }));
jest.mock('@/api/idempotency', () => ({
  createIdempotencyKeyStore: () => ({ keyFor: () => 'key-1', clear: () => undefined }),
}));
jest.mock('./trip-cache', () => ({ invalidateAfterJoin: jest.fn(async () => undefined) }));

const mockCreate = jest.mocked(createTrip);
const TRIP = { id: 't-new', title: '새 여행' } as Trip;

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

/** 끝나는 때를 테스트가 정하는 만들기 요청 */
function pendingCreate() {
  let finish: (trip: Trip) => void = () => {};
  mockCreate.mockImplementation(
    () =>
      new Promise<Trip>((resolve) => {
        finish = resolve;
      }),
  );
  return (trip: Trip) => finish(trip);
}

beforeEach(() => {
  mockCreate.mockReset();
  // gcTime Infinity: 캐시 정리 타이머가 남아 jest가 끝나지 않는 것을 막는다
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
});

describe('useCreateTrip', () => {
  it('화면이 열려 있으면 만든 여행으로 이동한다', async () => {
    const finish = pendingCreate();
    const onCreated = jest.fn();
    const { result } = await renderHook(() => useCreateTrip({ onCreated }), { wrapper });

    await act(async () => result.current.create({ title: '새 여행' } as never));
    await act(async () => finish(TRIP));

    expect(onCreated).toHaveBeenCalledWith(TRIP);
  });

  it('만드는 중 화면을 닫으면 이동하지 않고, 만든 여행은 캐시에 넣는다', async () => {
    // 예전에는 X로 닫아도 잠시 뒤 새 여행 화면이 갑자기 열렸다(2026-11-10 점검)
    const finish = pendingCreate();
    const onCreated = jest.fn();
    const { result, unmount } = await renderHook(() => useCreateTrip({ onCreated }), { wrapper });

    await act(async () => result.current.create({ title: '새 여행' } as never));
    await act(async () => unmount());
    await act(async () => finish(TRIP));

    expect(onCreated).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(tripKey(TRIP.id))).toEqual(TRIP);
  });
});
