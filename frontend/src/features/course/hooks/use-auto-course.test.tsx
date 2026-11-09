import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { getAutoCourse, requestAutoCourse } from '../api';
import { place } from '../testing';
import type { ItineraryProposal, JobStatus } from '../types';

import { AUTO_POLL_MS, AUTO_TIMEOUT_MS, useAutoCourse } from './use-auto-course';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));

jest.mock('../api', () => ({ requestAutoCourse: jest.fn(), getAutoCourse: jest.fn() }));

const mockRequest = jest.mocked(requestAutoCourse);
const mockGet = jest.mocked(getAutoCourse);

const CONTENT = {
  items: [{ day: 1, order: 1, place: place('a', 'A'), startTime: null, stayMinutes: null }],
  legs: [],
};

function proposal(status: JobStatus, withContent = status === 'SUCCEEDED'): ItineraryProposal {
  return {
    job: {
      id: 'job-1',
      kind: 'ITINERARY_PROPOSAL',
      status,
      progress: 0,
      result: null,
      error: null,
      createdAt: '',
      finishedAt: null,
    },
    baseVersion: 1,
    reason: 'INITIAL',
    proposed: withContent ? CONTENT : null,
    diff: null,
    appliedAt: null,
    canUndo: false,
  };
}

async function flush(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRequest.mockResolvedValue({ jobId: 'job-1', status: 'QUEUED', statusUrl: '' });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('자동 추천', () => {
  it('작업이 끝날 때까지 기다렸다가 추천 코스를 돌려준다', async () => {
    mockGet.mockResolvedValueOnce(proposal('RUNNING')).mockResolvedValueOnce(proposal('SUCCEEDED'));
    const { result } = await renderHook(() => useAutoCourse('trip-1'));
    let content: unknown = 'pending';
    await act(async () => {
      void result.current.start(3).then((c) => (content = c));
    });
    expect(result.current.status).toBe('running');
    await flush(AUTO_POLL_MS);
    expect(mockRequest).toHaveBeenCalledWith('trip-1', 3);
    expect(content).toEqual(CONTENT);
    expect(result.current.status).toBe('idle');
  });

  it.each(['FAILED', 'CANCELLED'] as const)('작업이 %s면 실패', async (status) => {
    mockGet.mockResolvedValue(proposal(status));
    const { result } = await renderHook(() => useAutoCourse('trip-1'));
    let content: unknown = 'pending';
    await act(async () => {
      content = await result.current.start(1);
    });
    expect(content).toBeNull();
    expect(result.current.status).toBe('failed');
  });

  it('성공했어도 장소가 없으면 실패', async () => {
    mockGet.mockResolvedValue({ ...proposal('SUCCEEDED'), proposed: { items: [], legs: [] } });
    const { result } = await renderHook(() => useAutoCourse('trip-1'));
    await act(async () => {
      await result.current.start(1);
    });
    expect(result.current.status).toBe('failed');
  });

  it('요청이 실패하면 실패, 실서버에 아직 없는 API', async () => {
    mockRequest.mockRejectedValue(new Error('404'));
    const { result } = await renderHook(() => useAutoCourse('trip-1'));
    await act(async () => {
      await result.current.start(1);
    });
    expect(result.current.status).toBe('failed');
  });

  it('1분이 넘으면 실패', async () => {
    mockGet.mockResolvedValue(proposal('RUNNING'));
    const { result } = await renderHook(() => useAutoCourse('trip-1'));
    await act(async () => {
      void result.current.start(1);
    });
    await flush(AUTO_TIMEOUT_MS + AUTO_POLL_MS * 2);
    expect(result.current.status).toBe('failed');
  });

  it('기다리는 중 다시 시작해도 요청은 하나', async () => {
    mockGet.mockResolvedValue(proposal('RUNNING'));
    const { result } = await renderHook(() => useAutoCourse('trip-1'));
    await act(async () => {
      void result.current.start(1);
      void result.current.start(1);
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});
