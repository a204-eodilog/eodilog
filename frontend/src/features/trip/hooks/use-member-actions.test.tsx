import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ReactNode } from 'react';

import { toast } from '@/components/ui';

import { deleteTrip, getTrip, removeMember, transferOwner } from '../api';
import type { Trip } from '../types';

import { useDeleteTrip, useRemoveMember, useTransferOwner } from './use-member-actions';
import { useTripEditDraft } from './use-trip-edit-draft';

jest.mock('../api', () => ({
  transferOwner: jest.fn(),
  removeMember: jest.fn(),
  deleteTrip: jest.fn(),
  getTrip: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: {} }));
jest.mock('@/components/ui', () => ({ toast: { show: jest.fn() } }));
jest.mock('../invite-storage', () => ({ forgetInviteLink: jest.fn() }));

const mockTransfer = jest.mocked(transferOwner);
const mockRemove = jest.mocked(removeMember);
const mockDelete = jest.mocked(deleteTrip);
const mockGetTrip = jest.mocked(getTrip);
const mockToast = jest.mocked(toast.show);

function makeTrip(over: Partial<Trip>): Trip {
  return {
    id: 't1',
    title: '겨울 여행',
    startDate: null,
    endDate: null,
    destinationRegionIds: [],
    status: 'PLANNING',
    currency: 'KRW',
    ownerMemberId: 'm-a',
    members: [],
    version: 3,
    expenseVersion: 0,
    ...over,
  };
}

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
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  jest.clearAllMocks();
  queryClient.setQueryData(['trips', 't1'], makeTrip({}));
  queryClient.setQueryData(['trips', 'mine'], { pages: [] });
  queryClient.setQueryData(['me', 'trips'], []);
});

describe('방장 넘기기', () => {
  it('성공하면 방장이 바뀐 여행으로 캐시를 바꾸고 목록을 새로 받게 한다', async () => {
    const after = makeTrip({ ownerMemberId: 'm-b', version: 4 });
    mockTransfer.mockResolvedValue(after);
    const { result } = await renderHook(() => useTransferOwner('t1'), { wrapper });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.run({ targetMemberId: 'm-b', expectedVersion: 3 });
    });

    expect(ok).toBe(true);
    expect(queryClient.getQueryData<Trip>(['trips', 't1'])?.ownerMemberId).toBe('m-b');
    expect(queryClient.getQueryState(['trips', 'mine'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['me', 'trips'])?.isInvalidated).toBe(true);
  });

  it.each([
    [409, 'VERSION_CONFLICT', '그 사이 여행이 바뀌었어요'],
    [403, 'FORBIDDEN', '방장만 할 수 있어요'],
  ])('%i이면 여행을 다시 받고 한 번만 보낸다', async (status, code, message) => {
    mockTransfer.mockRejectedValue(apiError(status, code));
    mockGetTrip.mockResolvedValue(makeTrip({ ownerMemberId: 'm-b', version: 5 }));
    const { result } = await renderHook(() => useTransferOwner('t1'), { wrapper });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.run({ targetMemberId: 'm-b', expectedVersion: 3 });
    });

    expect(ok).toBe(false);
    expect(mockTransfer).toHaveBeenCalledTimes(1);
    expect(mockGetTrip).toHaveBeenCalledWith('t1');
    expect(queryClient.getQueryData<Trip>(['trips', 't1'])?.version).toBe(5);
    expect(mockToast).toHaveBeenCalledWith(message);
  });
});

describe('동행 내보내기', () => {
  it('MEMBER_NOT_FOUND면 안내하고 여행을 다시 받는다', async () => {
    mockRemove.mockRejectedValue(apiError(404, 'MEMBER_NOT_FOUND'));
    mockGetTrip.mockResolvedValue(makeTrip({ version: 4 }));
    const { result } = await renderHook(() => useRemoveMember('t1'), { wrapper });

    await act(async () => {
      await result.current.run({ memberId: 'm-c', expectedVersion: 3 });
    });

    expect(mockToast).toHaveBeenCalledWith('이미 여행에 없는 동행이에요');
    expect(mockGetTrip).toHaveBeenCalledTimes(1);
  });

  it('성공하면 여행과 목록을 새로 받게 한다', async () => {
    mockRemove.mockResolvedValue(undefined);
    const { result } = await renderHook(() => useRemoveMember('t1'), { wrapper });
    await act(async () => {
      await result.current.run({ memberId: 'm-c', expectedVersion: 3 });
    });
    expect(mockRemove).toHaveBeenCalledWith('t1', 'm-c', 3);
    expect(queryClient.getQueryState(['trips', 'mine'])?.isInvalidated).toBe(true);
  });
});

describe('여행 삭제', () => {
  it('이미 삭제된 여행(404)은 성공으로 본다', async () => {
    mockDelete.mockRejectedValue(apiError(404, 'TRIP_NOT_FOUND'));
    const { result } = await renderHook(() => useDeleteTrip('t1'), { wrapper });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.run(3);
    });
    expect(ok).toBe(true);
    expect(mockGetTrip).not.toHaveBeenCalled();
  });

  it('409면 실패로 보고 여행을 다시 받는다', async () => {
    mockDelete.mockRejectedValue(apiError(409, 'VERSION_CONFLICT'));
    mockGetTrip.mockResolvedValue(makeTrip({ version: 4 }));
    const { result } = await renderHook(() => useDeleteTrip('t1'), { wrapper });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.run(3);
    });
    expect(ok).toBe(false);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockGetTrip).toHaveBeenCalledTimes(1);
  });
});

describe('내 변경 뒤 S19 수정 기준', () => {
  beforeEach(() => {
    useTripEditDraft.getState().fill(makeTrip({}), []);
    useTripEditDraft.getState().setTitle('고치던 이름');
  });

  it('넘기기가 성공하면 기준만 새 버전으로 옮기고 고치던 값은 둔다', async () => {
    mockTransfer.mockResolvedValue(makeTrip({ ownerMemberId: 'm-b', version: 4 }));
    const { result } = await renderHook(() => useTransferOwner('t1'), { wrapper });
    await act(async () => {
      await result.current.run({ targetMemberId: 'm-b', expectedVersion: 3 });
    });
    expect(useTripEditDraft.getState().base?.version).toBe(4);
    expect(useTripEditDraft.getState().title).toBe('고치던 이름');
  });

  it('내보내기가 성공하면 다시 받은 여행으로 기준을 옮긴다', async () => {
    mockRemove.mockResolvedValue(undefined);
    mockGetTrip.mockResolvedValue(makeTrip({ version: 4 }));
    const { result } = await renderHook(() => useRemoveMember('t1'), { wrapper });
    await act(async () => {
      await result.current.run({ memberId: 'm-c', expectedVersion: 3 });
    });
    expect(useTripEditDraft.getState().base?.version).toBe(4);
    expect(useTripEditDraft.getState().title).toBe('고치던 이름');
  });

  it('그 사이 다른 동행이 이름을 바꿨으면 기준을 옮기지 않아 저장 때 409로 알게 둔다', async () => {
    mockTransfer.mockResolvedValue(
      makeTrip({ ownerMemberId: 'm-b', version: 5, title: '다른 동행이 바꾼 이름' }),
    );
    const { result } = await renderHook(() => useTransferOwner('t1'), { wrapper });
    await act(async () => {
      await result.current.run({ targetMemberId: 'm-b', expectedVersion: 3 });
    });
    expect(useTripEditDraft.getState().base?.version).toBe(3);
  });
});
