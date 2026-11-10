import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { getAutoCourse, getItinerary } from '@/features/course/api';
import { httpError, sampleCourse } from '@/features/course/testing';

import { applyProposal, requestRemoval } from '../api';
import { job, proposal } from '../testing';

import { useProposal, type ProposalSource } from './use-proposal';

let mockKeySeq = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `key-${++mockKeySeq}` }));
jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('@/features/course/api', () => ({ getAutoCourse: jest.fn(), getItinerary: jest.fn() }));
jest.mock('../api', () => ({ requestRemoval: jest.fn(), applyProposal: jest.fn() }));

const mockGet = jest.mocked(getAutoCourse);
const mockItinerary = jest.mocked(getItinerary);
const mockRemove = jest.mocked(requestRemoval);
const mockApply = jest.mocked(applyProposal);

/** 지금 백엔드가 장소 빼기를 거절하는 응답(400 VALIDATION_ERROR, reason 칸) */
function reasonRejected(): AxiosError {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  return new AxiosError('VALIDATION_ERROR', 'ERR_BAD_REQUEST', config, null, {
    status: 400,
    statusText: 'VALIDATION_ERROR',
    headers: {},
    config,
    data: {
      error: {
        code: 'VALIDATION_ERROR',
        message: '입력값을 확인해 주세요.',
        fields: [{ field: 'reason', message: '아직 지원하지 않는 사유입니다.' }],
        traceId: null,
      },
    },
  });
}

let client: QueryClient;
function render(source: ProposalSource) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useProposal('trip-1', source), { wrapper });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockItinerary.mockResolvedValue(sampleCourse(true));
  mockRemove.mockResolvedValue({ jobId: 'job-p', status: 'QUEUED', statusUrl: '' });
  mockGet.mockReset();
  mockApply.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

it('장소 빼기는 지금 version으로 작업을 만들고 끝날 때까지 기다린다', async () => {
  mockGet
    .mockResolvedValueOnce(proposal({ job: job('RUNNING'), proposed: null }))
    .mockResolvedValueOnce(proposal());
  const { result } = await render({ removePlaceId: 'p-gwangalli' });
  await act(async () => {
    void result.current.start();
    await jest.advanceTimersByTimeAsync(0);
  });
  expect(mockRemove).toHaveBeenCalledWith('trip-1', 3, 'p-gwangalli', expect.any(String));
  expect(result.current.phase).toBe('running');
  await act(() => jest.advanceTimersByTimeAsync(1500));
  expect(result.current.phase).toBe('done');
  expect(result.current.jobId).toBe('job-p');
  expect(result.current.canRecreate).toBe(true);
});

it('날씨 작업 번호로 열면 작업을 만들지 않고 기다린다', async () => {
  mockGet.mockResolvedValue(proposal({ reason: 'WEATHER' }));
  const { result } = await render({ jobId: 'job-w' });
  await act(async () => {
    await result.current.start();
  });
  expect(mockRemove).not.toHaveBeenCalled();
  expect(mockGet).toHaveBeenCalledWith('trip-1', 'job-w', expect.anything());
  expect(result.current.phase).toBe('done');
  expect(result.current.canRecreate).toBe(false);
});

it('서버가 장소 빼기를 아직 받지 않으면 unsupported, 다시 시도하지 않게', async () => {
  mockRemove.mockRejectedValueOnce(reasonRejected());
  const { result } = await render({ removePlaceId: 'p-gwangalli' });
  await act(async () => {
    await result.current.start();
  });
  expect(result.current.phase).toBe('unsupported');
  expect(mockGet).not.toHaveBeenCalled();
});

it('작업이 실패하면 failed', async () => {
  mockGet.mockResolvedValue(proposal({ job: job('FAILED'), proposed: null }));
  const { result } = await render({ jobId: 'job-w' });
  await act(async () => {
    await result.current.start();
  });
  expect(result.current.phase).toBe('failed');
});

it('적용은 기준 version으로 보내고 코스 캐시를 바꾼다. 두 번 눌러도 한 번', async () => {
  mockGet.mockResolvedValue(proposal());
  let finish: () => void = () => {};
  mockApply.mockReturnValue(
    new Promise((r) => {
      finish = () => r({ ...sampleCourse(true), version: 4 });
    }),
  );
  const { result } = await render({ jobId: 'job-p' });
  await act(async () => {
    await result.current.start();
  });
  let first: Promise<string> = Promise.resolve('');
  let second = '';
  await act(async () => {
    first = result.current.apply();
    second = await result.current.apply();
  });
  expect(second).toBe('busy');
  await act(async () => finish());
  expect(await first).toBe('applied');
  expect(mockApply).toHaveBeenCalledTimes(1);
  expect(mockApply).toHaveBeenCalledWith('trip-1', 'job-p', 3);
  expect(client.getQueryData<{ version: number }>(['trips', 'trip-1', 'itinerary'])?.version).toBe(
    4,
  );
});

it('적용 409와 422를 구분한다', async () => {
  mockGet.mockResolvedValue(proposal());
  const { result } = await render({ jobId: 'job-p' });
  await act(async () => {
    await result.current.start();
  });
  mockApply.mockRejectedValueOnce(httpError(409, 'VERSION_CONFLICT'));
  await act(async () => {
    expect(await result.current.apply()).toBe('conflict');
  });
  mockApply.mockRejectedValueOnce(httpError(422, 'UNSCHEDULABLE_ALTERNATIVE'));
  await act(async () => {
    expect(await result.current.apply()).toBe('unschedulable');
  });
});

it('장소 빼기 요청이 응답 없이 끊기면 같은 키로, 서버가 답했으면 새 키로 다시 보낸다', async () => {
  mockRemove
    .mockRejectedValueOnce(new Error('Network Error'))
    .mockRejectedValueOnce(httpError(400, 'VALIDATION_ERROR'));
  mockGet.mockResolvedValue(proposal());
  const { result } = await render({ removePlaceId: 'p-gwangalli' });
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await result.current.start();
    });
  }
  const keys = mockRemove.mock.calls.map((c) => c[3]);
  expect(keys).toHaveLength(3);
  expect(keys[1]).toBe(keys[0]);
  expect(keys[2]).not.toBe(keys[1]);
});

it.each([
  [409, 'ALREADY_APPLIED', 'alreadyApplied'],
  [409, 'PROPOSAL_NOT_READY', 'notReady'],
  [404, 'JOB_NOT_FOUND', 'gone'],
] as const)('적용이 %s %s면 %s', async (status, code, expected) => {
  mockGet.mockResolvedValue(proposal());
  mockApply.mockRejectedValue(httpError(status, code));
  const { result } = await render({ jobId: 'job-p' });
  await act(async () => {
    await result.current.start();
  });
  let applied = '';
  await act(async () => {
    applied = await result.current.apply();
  });
  expect(applied).toBe(expected);
});

it('이미 적용한 변경안이면 보내지 않고 alreadyApplied', async () => {
  mockGet.mockResolvedValue(proposal({ appliedAt: '2026-11-14T03:00:00Z' }));
  const { result } = await render({ jobId: 'job-p' });
  await act(async () => {
    await result.current.start();
  });
  let applied = '';
  await act(async () => {
    applied = await result.current.apply();
  });
  expect(applied).toBe('alreadyApplied');
  expect(mockApply).not.toHaveBeenCalled();
});
