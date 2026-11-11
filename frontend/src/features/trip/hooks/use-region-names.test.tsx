import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ReactNode } from 'react';

import { getRegion } from '../api';
import type { Region } from '../types';

import { ensureRegions, useRegions } from './use-region-names';

/**
 * 여행 설정은 받은 여행지로 입력 칸을 채우고 [완료]가 여행지 전체를 보낸다.
 * 여행지 이름 하나를 잠깐 못 받았는데 빼고 채우면, 아무것도 안 고쳐도 그 여행지가 지워졌다(2026-11-10 점검)
 */

jest.mock('../api', () => ({ getRegion: jest.fn() }));

const mockGetRegion = jest.mocked(getRegion);

const BUSAN = { id: 'r-busan', name: '부산광역시' } as Region;
const JEJU = { id: 'r-jeju', name: '제주특별자치도' } as Region;

function httpError(status: number) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('fail', undefined, config, undefined, {
    status,
    statusText: '',
    headers: {},
    config,
    data: { error: { code: status === 404 ? 'REGION_NOT_FOUND' : 'INTERNAL_ERROR', message: '' } },
  });
}

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  mockGetRegion.mockReset();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('useRegions', () => {
  it('여행지 하나를 잠깐 못 받으면 준비되지 않은 것으로 보고, 다시 받으면 준비된다', async () => {
    mockGetRegion.mockImplementation(async (id) => {
      if (id === 'r-jeju') throw httpError(500);
      return BUSAN;
    });
    const { result } = await renderHook(() => useRegions(['r-busan', 'r-jeju']), { wrapper });

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.ready).toBe(false);
    expect(result.current.regions).toEqual([BUSAN]);

    mockGetRegion.mockImplementation(async (id) => (id === 'r-jeju' ? JEJU : BUSAN));
    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.failed).toBe(false);
    expect(result.current.regions).toEqual([BUSAN, JEJU]);
  });

  it('없어진 여행지(404)는 기다리지 않고 빼고 준비된다', async () => {
    mockGetRegion.mockImplementation(async (id) => {
      if (id === 'r-jeju') throw httpError(404);
      return BUSAN;
    });
    const { result } = await renderHook(() => useRegions(['r-busan', 'r-jeju']), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.failed).toBe(false);
    expect(result.current.regions).toEqual([BUSAN]);
  });
});

describe('ensureRegions', () => {
  it('여행지 하나를 잠깐 못 받으면 빼지 않고 실패한다', async () => {
    mockGetRegion.mockImplementation(async (id) => {
      if (id === 'r-jeju') throw httpError(500);
      return BUSAN;
    });
    await expect(ensureRegions(queryClient, ['r-busan', 'r-jeju'])).rejects.toBeInstanceOf(
      AxiosError,
    );
  });

  it('없어진 여행지(404)만 빼고 나머지를 돌려준다', async () => {
    mockGetRegion.mockImplementation(async (id) => {
      if (id === 'r-jeju') throw httpError(404);
      return BUSAN;
    });
    await expect(ensureRegions(queryClient, ['r-busan', 'r-jeju'])).resolves.toEqual([BUSAN]);
  });
});
