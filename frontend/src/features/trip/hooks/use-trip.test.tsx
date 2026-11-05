import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ReactNode } from 'react';

import { getTrip } from '../api';
import { forgetInviteLink } from '../invite-storage';

import { useTrip } from './use-trip';

jest.mock('../api', () => ({ getTrip: jest.fn() }));
jest.mock('../invite-storage', () => ({ forgetInviteLink: jest.fn(async () => undefined) }));

const mockGetTrip = jest.mocked(getTrip);
const mockForget = jest.mocked(forgetInviteLink);

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
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  jest.clearAllMocks();
  queryClient.setQueryData(['trips', 't1', 'invite'], { url: 'x', expiresAt: '2099-01-01' });
});

describe('useTrip 초대 링크 정리', () => {
  it('404 TRIP_NOT_FOUND면 이 기기의 초대 링크를 지운다', async () => {
    mockGetTrip.mockRejectedValue(apiError(404, 'TRIP_NOT_FOUND'));
    const { result } = await renderHook(() => useTrip('t1'), { wrapper });
    await waitFor(() => expect(result.current.notFound).toBe(true));
    await waitFor(() => expect(mockForget).toHaveBeenCalledWith('t1'));
    expect(queryClient.getQueryData(['trips', 't1', 'invite'])).toBeNull();
  });

  it('다른 오류는 링크를 지우지 않는다', async () => {
    mockGetTrip.mockRejectedValue(apiError(500, 'INTERNAL_ERROR'));
    const { result } = await renderHook(() => useTrip('t1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockForget).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['trips', 't1', 'invite'])).not.toBeNull();
  });
});
