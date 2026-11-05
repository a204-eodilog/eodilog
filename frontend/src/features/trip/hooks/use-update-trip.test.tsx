import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ReactNode } from 'react';

import { getTrip, updateTrip } from '../api';
import type { Region, Trip } from '../types';

import { useTripEditDraft } from './use-trip-edit-draft';
import { useUpdateTrip } from './use-update-trip';

jest.mock('../api', () => ({ updateTrip: jest.fn(), getTrip: jest.fn(), getRegion: jest.fn() }));
jest.mock('expo-router', () => ({ router: {} }));
jest.mock('@/components/ui', () => ({ toast: { show: jest.fn() } }));
jest.mock('../invite-storage', () => ({ forgetInviteLink: jest.fn() }));

const mockUpdateTrip = jest.mocked(updateTrip);
const mockGetTrip = jest.mocked(getTrip);

const BUSAN: Region = {
  id: 'r-busan',
  code: '26',
  name: '부산광역시',
  parentId: null,
  latitude: null,
  longitude: null,
};

function makeTrip(over: Partial<Trip>): Trip {
  return {
    id: 't1',
    title: '겨울 여행',
    startDate: null,
    endDate: null,
    destinationRegionIds: [],
    status: 'PLANNING',
    currency: 'KRW',
    ownerMemberId: 'm1',
    members: [],
    version: 3,
    expenseVersion: 0,
    ...over,
  };
}

function conflict() {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('fail', undefined, config, undefined, {
    status: 409,
    statusText: '',
    headers: {},
    config,
    data: { error: { code: 'VERSION_CONFLICT', message: '' } },
  });
}

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  mockUpdateTrip.mockReset();
  mockGetTrip.mockReset();
  const base = makeTrip({});
  queryClient.setQueryData(['trips', 't1'], base);
  queryClient.setQueryData(['trips', 'mine'], { pages: [] });
  queryClient.setQueryData(['me', 'trips'], []);
  useTripEditDraft.getState().fill(base, []);
});

describe('useUpdateTrip', () => {
  it('저장하면 여행 캐시를 응답으로 바꾸고 두 목록을 새로 받게 한다', async () => {
    const saved = makeTrip({ title: '부산 바다', version: 4 });
    mockUpdateTrip.mockResolvedValue(saved);
    useTripEditDraft.getState().setTitle('부산 바다');
    const { result } = await renderHook(() => useUpdateTrip('t1'), { wrapper });

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.save();
    });

    expect(outcome).toBe('saved');
    expect(mockUpdateTrip).toHaveBeenCalledWith('t1', { expectedVersion: 3, title: '부산 바다' });
    expect(queryClient.getQueryData(['trips', 't1'])).toEqual(saved);
    expect(queryClient.getQueryState(['trips', 'mine'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['me', 'trips'])?.isInvalidated).toBe(true);
  });

  it('바뀐 게 없으면 요청하지 않는다', async () => {
    const { result } = await renderHook(() => useUpdateTrip('t1'), { wrapper });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.save();
    });
    expect(outcome).toBe('unchanged');
    expect(mockUpdateTrip).not.toHaveBeenCalled();
  });

  it('409면 최신 여행으로 입력을 다시 채우고 다시 보내지 않는다', async () => {
    mockUpdateTrip.mockRejectedValue(conflict());
    const latest = makeTrip({ title: '다른 동행이 바꾼 이름', version: 4 });
    mockGetTrip.mockResolvedValue(latest);
    useTripEditDraft.getState().setTitle('내가 바꾼 이름');
    const { result } = await renderHook(() => useUpdateTrip('t1'), { wrapper });

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.save();
    });

    expect(outcome).toBe('failed');
    expect(mockUpdateTrip).toHaveBeenCalledTimes(1);
    expect(useTripEditDraft.getState().title).toBe('다른 동행이 바꾼 이름');
    expect(useTripEditDraft.getState().base?.version).toBe(4);
  });

  it('연결이 끊기면 입력을 그대로 둔다', async () => {
    mockUpdateTrip.mockRejectedValue(new Error('Network Error'));
    useTripEditDraft.getState().setTitle('내가 바꾼 이름');
    const { result } = await renderHook(() => useUpdateTrip('t1'), { wrapper });
    await act(async () => {
      await result.current.save();
    });
    expect(useTripEditDraft.getState().title).toBe('내가 바꾼 이름');
    expect(result.current.failure).toBe('error');
  });

  it('수정 중 캐시가 새 버전으로 바뀌어도 base 버전을 보내 409로 알게 된다', async () => {
    mockUpdateTrip.mockRejectedValue(conflict());
    mockGetTrip.mockResolvedValue(makeTrip({ version: 5, destinationRegionIds: ['r-busan'] }));
    queryClient.setQueryData(['regions', 'r-busan'], BUSAN);
    useTripEditDraft.getState().setTitle('내가 바꾼 이름');
    // 앱이 다시 앞으로 와서 다른 동행이 바꾼 여행을 받은 상황
    queryClient.setQueryData(['trips', 't1'], makeTrip({ version: 5 }));
    const { result } = await renderHook(() => useUpdateTrip('t1'), { wrapper });

    await act(async () => {
      await result.current.save();
    });

    expect(mockUpdateTrip).toHaveBeenCalledWith('t1', {
      expectedVersion: 3,
      title: '내가 바꾼 이름',
    });
    expect(useTripEditDraft.getState().regions).toEqual([BUSAN]);
  });
});
