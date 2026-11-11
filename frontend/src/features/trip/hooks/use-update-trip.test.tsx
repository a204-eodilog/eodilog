import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ReactNode } from 'react';

import { toast } from '@/components/ui';

import { getRegion, getTrip, updateTrip } from '../api';
import type { Region, Trip } from '../types';

import { useTripEditDraft } from './use-trip-edit-draft';
import { useUpdateTrip } from './use-update-trip';

jest.mock('../api', () => ({ updateTrip: jest.fn(), getTrip: jest.fn(), getRegion: jest.fn() }));
jest.mock('expo-router', () => ({ router: {} }));
jest.mock('@/components/ui', () => ({ toast: { show: jest.fn() } }));
jest.mock('../invite-storage', () => ({ forgetInviteLink: jest.fn() }));

const mockUpdateTrip = jest.mocked(updateTrip);
const mockGetTrip = jest.mocked(getTrip);
const mockToast = jest.mocked(toast.show);

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
  mockToast.mockReset();
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
  it('409 뒤 다른 동행이 안 고친 칸은 내 입력을 남긴다', async () => {
    mockUpdateTrip.mockRejectedValue(conflict());
    // 친구는 여행지만 바꿨다
    mockGetTrip.mockResolvedValue(makeTrip({ version: 4, destinationRegionIds: ['r-busan'] }));
    queryClient.setQueryData(['regions', 'r-busan'], BUSAN);
    useTripEditDraft.getState().setTitle('내가 바꾼 이름');
    useTripEditDraft.getState().setRange({ start: '2026-12-20', end: '2026-12-22' });
    const { result } = await renderHook(() => useUpdateTrip('t1'), { wrapper });

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.save();
    });

    const draft = useTripEditDraft.getState();
    expect(outcome).toBe('failed');
    expect(draft.title).toBe('내가 바꾼 이름');
    expect(draft.range).toEqual({ start: '2026-12-20', end: '2026-12-22' });
    expect(draft.regions).toEqual([BUSAN]);
    expect(draft.base?.version).toBe(4);
    expect(mockToast).toHaveBeenCalledWith(
      '다른 동행이 먼저 고쳤어요. 내가 고친 내용은 남겨 뒀으니 다시 저장해 주세요',
    );
  });

  it('409 뒤 겹친 칸은 최신 값을 보이고 그 칸을 알린다', async () => {
    mockUpdateTrip.mockRejectedValue(conflict());
    mockGetTrip.mockResolvedValue(makeTrip({ title: '친구가 바꾼 이름', version: 4 }));
    useTripEditDraft.getState().setTitle('내가 바꾼 이름');
    const { result } = await renderHook(() => useUpdateTrip('t1'), { wrapper });
    await act(async () => {
      await result.current.save();
    });
    expect(useTripEditDraft.getState().title).toBe('친구가 바꾼 이름');
    expect(mockToast).toHaveBeenCalledWith(
      '이름 칸은 다른 동행이 먼저 바꿨어요. 확인하고 다시 저장해 주세요',
    );
  });

  it('응답만 놓친 내 저장을 다시 보내 409를 받으면 저장된 것으로 본다', async () => {
    // 첫 저장은 서버에 들어갔지만 응답이 오지 않았다. 다시 누르면 버전이 올라 있어 409다
    mockUpdateTrip.mockRejectedValue(conflict());
    mockGetTrip.mockResolvedValue(makeTrip({ title: '부산 바다', version: 4 }));
    useTripEditDraft.getState().setTitle('부산 바다');
    const { result } = await renderHook(() => useUpdateTrip('t1'), { wrapper });

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.save();
    });

    expect(outcome).toBe('saved');
    expect(mockToast).not.toHaveBeenCalled();
    expect(result.current.failure).toBeNull();
  });

  it('409 뒤 최신 여행지 이름을 잠깐 못 받으면 입력을 바꾸지 않고 실패로 둔다', async () => {
    // 최신 여행에 새 여행지가 생겼는데 그 이름을 못 받았다. 빼고 채우면 다시 저장할 때 그 여행지가 지워진다
    mockUpdateTrip.mockRejectedValue(conflict());
    mockGetTrip.mockResolvedValue(makeTrip({ version: 4, destinationRegionIds: ['r-busan'] }));
    jest.mocked(getRegion).mockRejectedValue(serverError());
    useTripEditDraft.getState().setTitle('내가 바꾼 이름');
    const { result } = await renderHook(() => useUpdateTrip('t1'), { wrapper });

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.save();
    });

    expect(outcome).toBe('failed');
    const draft = useTripEditDraft.getState();
    expect(draft.base?.version).toBe(3);
    expect(draft.title).toBe('내가 바꾼 이름');
    expect(mockToast).toHaveBeenCalledWith('다른 동행이 먼저 고쳤어요. 다시 시도해 주세요');
  });
});

function serverError() {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('fail', undefined, config, undefined, {
    status: 500,
    statusText: '',
    headers: {},
    config,
    data: { error: { code: 'INTERNAL_ERROR', message: '' } },
  });
}
