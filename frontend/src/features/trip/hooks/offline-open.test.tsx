import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { isWaitingOffline } from '@/api/query-focus';

import { getMyTrips, getRegion, getTrip } from '../api';
import type { Region, Trip } from '../types';

import { useMyTrips } from './use-my-trips';
import { useRegions } from './use-region-names';
import { useTrip } from './use-trip';

/**
 * 받아 둔 데이터 없이 연결이 끊긴 채 여행 화면을 열면(2026-11-09).
 * 조회가 오류로 끝나지 않고 멈춰 화면이 로딩만 돌던 것을, 멈춘 것으로 알아 연결 안내를 보이게 한다.
 * 연결이 돌아오면 멈춘 조회를 자동으로 보내 화면이 채워진다
 */

jest.mock('../api', () => ({ getTrip: jest.fn(), getRegion: jest.fn(), getMyTrips: jest.fn() }));
jest.mock('../invite-storage', () => ({ forgetInviteLink: jest.fn(async () => undefined) }));
jest.mock('@/hooks/use-seoul-today', () => ({ useSeoulToday: () => '2026-11-09' }));

const mockGetTrip = jest.mocked(getTrip);
const mockGetRegion = jest.mocked(getRegion);
const mockGetMyTrips = jest.mocked(getMyTrips);

const TRIP = { id: 't1', title: '겨울 여행', destinationRegionIds: ['r-busan'] } as unknown as Trip;
const BUSAN = { id: 'r-busan', name: '부산광역시' } as Region;

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.mount();
  mockGetTrip.mockResolvedValue(TRIP);
  mockGetRegion.mockResolvedValue(BUSAN);
  mockGetMyTrips.mockResolvedValue({ data: [TRIP], page: { hasNext: false, nextCursor: null } });
  onlineManager.setOnline(false);
});

afterEach(() => {
  onlineManager.setOnline(true);
  queryClient.unmount();
});

describe('끊긴 채 여행 화면 열기', () => {
  it('여행 상세: 받은 여행이 없으면 멈춘 것으로 알고, 연결되면 자동으로 받는다', async () => {
    const { result } = await renderHook(() => useTrip('t1'), { wrapper });

    expect(result.current.isPending).toBe(true);
    expect(isWaitingOffline(result.current)).toBe(true);
    expect(mockGetTrip).not.toHaveBeenCalled();

    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(result.current.data).toEqual(TRIP));
    expect(isWaitingOffline(result.current)).toBe(false);
  });

  it('여행 설정: 여행은 있어도 여행지 이름을 못 받았으면 멈춘 것으로 안다', async () => {
    const { result } = await renderHook(() => useRegions(['r-busan']), { wrapper });

    expect(result.current.ready).toBe(false);
    expect(result.current.waitingOffline).toBe(true);

    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.waitingOffline).toBe(false);
    expect(result.current.regions).toEqual([BUSAN]);
  });

  it('여행 탭: 받은 목록이 없으면 offline이고, 연결되면 목록이 된다', async () => {
    const { result } = await renderHook(() => useMyTrips(), { wrapper });

    expect(result.current.listState.kind).toBe('offline');

    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(result.current.listState.kind).toBe('ready'));
  });
});
