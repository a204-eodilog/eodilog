import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { getAutoCourse, getJob } from '@/features/course/api';
import type { ItineraryProposal, Job } from '@/features/course/types';

import { requestWeatherAlternatives, requestWeatherProposal } from '../api';
import { alternativesResult } from '../testing';

import { useWeatherAlternatives } from './use-weather-alternatives';

jest.mock('@/features/course/api', () => ({ getJob: jest.fn(), getAutoCourse: jest.fn() }));
jest.mock('../api', () => ({
  requestWeatherAlternatives: jest.fn(),
  requestWeatherProposal: jest.fn(),
}));
let mockKeySeq = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `key-${++mockKeySeq}` }));

const mockRequest = jest.mocked(requestWeatherAlternatives);
const mockPropose = jest.mocked(requestWeatherProposal);
const mockJob = jest.mocked(getJob);
const mockProposal = jest.mocked(getAutoCourse);

const job = (status: Job['status'], result: unknown = null): Job => ({
  id: 'job-w',
  kind: 'WEATHER_ALTERNATIVES',
  status,
  progress: 0,
  result,
  error: null,
  createdAt: '',
  finishedAt: null,
});
const proposalOf = (status: Job['status']) =>
  ({
    job: job(status),
    baseVersion: 3,
    reason: 'WEATHER',
    proposed: null,
    diff: null,
    appliedAt: null,
    canUndo: false,
  }) as ItineraryProposal;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRequest.mockResolvedValue({ jobId: 'job-w', status: 'QUEUED', statusUrl: '' });
  mockPropose.mockResolvedValue({ jobId: 'job-p', status: 'QUEUED', statusUrl: '' });
});

afterEach(() => {
  jest.useRealTimers();
});

it('날씨 대안 작업이 끝나면 결과를 두고, 고른 대안으로 변경안을 만든다', async () => {
  mockJob
    .mockResolvedValueOnce(job('RUNNING'))
    .mockResolvedValueOnce(job('SUCCEEDED', alternativesResult()));
  mockProposal
    .mockResolvedValueOnce(proposalOf('RUNNING'))
    .mockResolvedValueOnce(proposalOf('SUCCEEDED'));
  const { result } = await renderHook(() => useWeatherAlternatives('trip-1'));
  await act(async () => {
    void result.current.start('2026-11-14', 'p-haeundae', 3);
    await jest.advanceTimersByTimeAsync(0);
  });
  expect(result.current.phase).toBe('running');
  expect(mockRequest).toHaveBeenCalledWith('trip-1', {
    date: '2026-11-14',
    placeId: 'p-haeundae',
    expectedVersion: 3,
  });
  await act(() => jest.advanceTimersByTimeAsync(1500));
  expect(result.current.phase).toBe('done');
  expect(result.current.result?.alternatives).toHaveLength(4);

  let ok = false;
  await act(async () => {
    const p = result.current.makeProposal('alt-2');
    await jest.advanceTimersByTimeAsync(1500);
    ok = await p;
  });
  expect(ok).toBe(true);
  expect(mockPropose).toHaveBeenCalledWith(
    'trip-1',
    { expectedVersion: 3, sourceWeatherJobId: 'job-w', selectedAlternativeId: 'alt-2' },
    expect.stringMatching(/^key-/),
  );
  expect(result.current.proposal).toEqual({ phase: 'done', jobId: 'job-p' });
  await act(async () => result.current.closeProposal());
  expect(result.current.proposal.phase).toBe('idle');
});

it('대안 작업이 실패하거나 결과가 없으면 failed', async () => {
  mockJob.mockResolvedValueOnce(job('FAILED'));
  const { result } = await renderHook(() => useWeatherAlternatives('trip-1'));
  await act(async () => {
    await result.current.start('2026-11-14', 'p-haeundae', 3);
  });
  expect(result.current.phase).toBe('failed');
  mockRequest.mockRejectedValueOnce(new Error('network'));
  await act(async () => {
    await result.current.start('2026-11-14', 'p-haeundae', 3);
  });
  expect(result.current.phase).toBe('failed');
});

it('변경안 작업이 실패하면 시트 없이 failed', async () => {
  mockJob.mockResolvedValueOnce(job('SUCCEEDED', alternativesResult()));
  mockProposal.mockResolvedValueOnce(proposalOf('FAILED'));
  const { result } = await renderHook(() => useWeatherAlternatives('trip-1'));
  await act(async () => {
    await result.current.start('2026-11-14', 'p-haeundae', 3);
  });
  let ok = true;
  await act(async () => {
    ok = await result.current.makeProposal('alt-2');
  });
  expect(ok).toBe(false);
  expect(result.current.proposal.phase).toBe('failed');
});

it('화면을 나가면 더 확인하지 않는다', async () => {
  mockJob.mockResolvedValue(job('RUNNING'));
  const { result, unmount } = await renderHook(() => useWeatherAlternatives('trip-1'));
  await act(async () => {
    void result.current.start('2026-11-14', 'p-haeundae', 3);
    await jest.advanceTimersByTimeAsync(0);
  });
  const calls = mockJob.mock.calls.length;
  await unmount();
  await act(() => jest.advanceTimersByTimeAsync(6000));
  expect(mockJob.mock.calls.length).toBe(calls);
});

it('변경안 요청이 응답 없이 끊기면 같은 키로, 서버가 답했으면 새 키로 다시 보낸다', async () => {
  mockJob.mockResolvedValueOnce(job('SUCCEEDED', alternativesResult()));
  mockPropose.mockRejectedValueOnce(new Error('Network Error')).mockRejectedValueOnce(
    Object.assign(new Error('400'), {
      isAxiosError: true,
      response: { status: 400, data: {}, headers: {} },
    }),
  );
  mockProposal.mockResolvedValue(proposalOf('FAILED'));
  const { result } = await renderHook(() => useWeatherAlternatives('trip-1'));
  await act(async () => {
    await result.current.start('2026-11-14', 'p-haeundae', 3);
  });
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await result.current.makeProposal('alt-2');
    });
  }
  const keys = mockPropose.mock.calls.map((c) => c[2]);
  expect(keys[1]).toBe(keys[0]);
  expect(keys[2]).not.toBe(keys[1]);
});
