import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { getRecommendation, requestRecommendation } from '../api';
import { result } from '../testing';

import { useRecommendation } from './use-recommendation';

jest.mock('../api', () => ({ requestRecommendation: jest.fn(), getRecommendation: jest.fn() }));

const mockRequest = jest.mocked(requestRecommendation);
const mockGet = jest.mocked(getRecommendation);
const ref = (jobId: string) => ({ jobId, status: 'QUEUED' as const, statusUrl: '' });

beforeEach(() => {
  jest.useFakeTimers();
  mockRequest.mockReset();
  mockGet.mockReset();
  mockRequest.mockResolvedValue(ref('job-1'));
});

afterEach(() => {
  jest.useRealTimers();
});

it('끝날 때까지 1.5초마다 확인하고 성공하면 결과를 둔다', async () => {
  mockGet
    .mockResolvedValueOnce(result({ status: 'RUNNING', progress: 30 }))
    .mockResolvedValueOnce(result({ status: 'RUNNING', progress: 60 }))
    .mockResolvedValueOnce(result());
  const { result: hook } = await renderHook(() => useRecommendation('trip-1'));
  await act(async () => {
    void hook.current.start();
    await jest.advanceTimersByTimeAsync(0);
  });
  expect(hook.current.phase).toBe('running');
  expect(hook.current.result?.job.progress).toBe(30);
  await act(() => jest.advanceTimersByTimeAsync(1500));
  expect(mockGet).toHaveBeenCalledTimes(2);
  await act(() => jest.advanceTimersByTimeAsync(1500));
  expect(hook.current.phase).toBe('done');
  expect(hook.current.result?.items).toHaveLength(5);
  expect(mockGet).toHaveBeenCalledWith('trip-1', 'job-1');
});

it('작업이 실패하거나 요청이 실패하면 failed', async () => {
  mockGet.mockResolvedValueOnce(result({ status: 'FAILED' }));
  const { result: hook } = await renderHook(() => useRecommendation('trip-1'));
  await act(async () => {
    await hook.current.start();
  });
  expect(hook.current.phase).toBe('failed');

  mockRequest.mockRejectedValueOnce(new Error('network'));
  await act(async () => {
    await hook.current.start();
  });
  expect(hook.current.phase).toBe('failed');
  expect(hook.current.result).toBeNull();
});

it('2분이 넘도록 끝나지 않으면 failed', async () => {
  mockGet.mockResolvedValue(result({ status: 'RUNNING' }));
  const { result: hook } = await renderHook(() => useRecommendation('trip-1'));
  await act(async () => {
    void hook.current.start();
    await jest.advanceTimersByTimeAsync(119_000);
  });
  expect(hook.current.phase).toBe('running');
  await act(() => jest.advanceTimersByTimeAsync(3000));
  expect(hook.current.phase).toBe('failed');
});

it('다시 시작하면 이전 작업 결과는 쓰지 않는다', async () => {
  mockRequest.mockResolvedValueOnce(ref('job-old')).mockResolvedValueOnce(ref('job-new'));
  mockGet.mockImplementation(async (_trip, jobId) =>
    jobId === 'job-old' ? result({ status: 'RUNNING' }) : result({ insufficientData: true }),
  );
  const { result: hook } = await renderHook(() => useRecommendation('trip-1'));
  await act(async () => {
    void hook.current.start();
    await jest.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await hook.current.start();
  });
  expect(hook.current.phase).toBe('done');
  expect(hook.current.result?.insufficientData).toBe(true);
  const oldCalls = mockGet.mock.calls.filter(([, id]) => id === 'job-old').length;
  await act(() => jest.advanceTimersByTimeAsync(6000));
  expect(mockGet.mock.calls.filter(([, id]) => id === 'job-old')).toHaveLength(oldCalls);
});

it('화면을 나가면 더 확인하지 않는다', async () => {
  mockGet.mockResolvedValue(result({ status: 'RUNNING' }));
  const { result: hook, unmount } = await renderHook(() => useRecommendation('trip-1'));
  await act(async () => {
    void hook.current.start();
    await jest.advanceTimersByTimeAsync(0);
  });
  const calls = mockGet.mock.calls.length;
  await unmount();
  await act(() => jest.advanceTimersByTimeAsync(6000));
  expect(mockGet.mock.calls.length).toBeLessThanOrEqual(calls + 1);
});
