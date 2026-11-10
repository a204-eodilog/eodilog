import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { getAutoCourse, requestAutoCourse } from '../api';
import { place } from '../testing';
import type { ItineraryProposal, JobStatus } from '../types';

import {
  AUTO_MIN_REQUEST_MS,
  AUTO_POLL_MS,
  AUTO_TIMEOUT_MS,
  useAutoCourse,
} from './use-auto-course';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));

jest.mock('../api', () => ({ requestAutoCourse: jest.fn(), getAutoCourse: jest.fn() }));
let mockKeySeq = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `key-${++mockKeySeq}` }));

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
    const accepted = jest.fn();
    await act(async () => {
      void result.current.start(3, accepted).then((c) => (content = c));
    });
    expect(result.current.status).toBe('running');
    expect(accepted).toHaveBeenCalledTimes(1);
    await flush(AUTO_POLL_MS);
    expect(mockRequest).toHaveBeenCalledWith('trip-1', 3, expect.stringMatching(/^key-/));
    expect(content).toEqual({ content: CONTENT, jobId: 'job-1' });
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

  it('요청이 바로 실패하면 작업 시작을 알리지 않고, 잠깐 요청 중으로 둔 뒤 실패', async () => {
    mockRequest.mockRejectedValue(new Error('404'));
    const { result } = await renderHook(() => useAutoCourse('trip-1'));
    const accepted = jest.fn();
    await act(async () => {
      void result.current.start(1, accepted);
    });
    // 생성 중 화면으로 넘어가지 않고 누른 버튼만 돈다
    expect(result.current.status).toBe('requesting');
    await flush(AUTO_MIN_REQUEST_MS);
    expect(result.current.status).toBe('failed');
    expect(accepted).not.toHaveBeenCalled();
  });

  it.each([
    [422, 'INSUFFICIENT_DATA', 'noPlaces'],
    [409, 'VERSION_CONFLICT', 'conflict'],
    [500, 'INTERNAL_ERROR', 'failed'],
  ] as const)('요청이 %s %s면 실패 까닭은 %s', async (status, code, failure) => {
    mockRequest.mockRejectedValue(
      Object.assign(new Error(code), {
        isAxiosError: true,
        response: { status, data: { error: { code, message: '' } }, headers: {} },
      }),
    );
    const { result } = await renderHook(() => useAutoCourse('trip-1'));
    await act(async () => {
      void result.current.start(1);
    });
    await flush(AUTO_MIN_REQUEST_MS);
    expect(result.current.status).toBe('failed');
    expect(result.current.failure).toBe(failure);
  });

  it('AI 일시 실패로 백엔드가 다시 시도하는 3분 동안은 실패로 끝내지 않는다', async () => {
    mockGet.mockResolvedValue(proposal('QUEUED'));
    const { result } = await renderHook(() => useAutoCourse('trip-1'));
    await act(async () => {
      void result.current.start(1);
    });
    await flush(3 * 60_000);
    expect(result.current.status).toBe('running');
  });

  it('요청한 사람이 여행을 나가 작업이 취소되면 revoked', async () => {
    mockGet.mockResolvedValue({
      ...proposal('CANCELLED'),
      job: { ...proposal('CANCELLED').job, error: { code: 'POLICY_REVOKED', message: '' } },
    });
    const { result } = await renderHook(() => useAutoCourse('trip-1'));
    await act(async () => {
      await result.current.start(1);
    });
    expect(result.current.failure).toBe('revoked');
  });

  it('기다리는 시간을 넘기면 실패', async () => {
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

  describe('Idempotency-Key', () => {
    const keyOf = (call: number) => mockRequest.mock.calls[call][2];
    const serverError = (status: number) =>
      Object.assign(new Error(String(status)), {
        isAxiosError: true,
        response: { status, data: {}, headers: {} },
      });
    async function runOnce(result: { current: ReturnType<typeof useAutoCourse> }) {
      await act(async () => {
        void result.current.start(1);
      });
      await flush(AUTO_MIN_REQUEST_MS + AUTO_POLL_MS);
    }

    it('응답을 못 받고 다시 보내면 같은 키를 쓴다', async () => {
      mockRequest.mockRejectedValueOnce(new Error('Network Error'));
      mockGet.mockResolvedValue(proposal('FAILED'));
      const { result } = await renderHook(() => useAutoCourse('trip-1'));
      await runOnce(result);
      await runOnce(result);
      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(keyOf(1)).toBe(keyOf(0));
    });

    it('서버가 거절했으면 다음에는 새 키를 쓴다', async () => {
      mockRequest.mockRejectedValueOnce(serverError(400));
      mockGet.mockResolvedValue(proposal('FAILED'));
      const { result } = await renderHook(() => useAutoCourse('trip-1'));
      await runOnce(result);
      await runOnce(result);
      expect(keyOf(1)).not.toBe(keyOf(0));
    });

    it('작업을 받은 뒤 실패해 다시 시도하면 새 키라 새 작업이 생긴다', async () => {
      mockGet.mockResolvedValue(proposal('FAILED'));
      const { result } = await renderHook(() => useAutoCourse('trip-1'));
      await runOnce(result);
      expect(result.current.status).toBe('failed');
      await runOnce(result);
      expect(keyOf(1)).not.toBe(keyOf(0));
    });
  });
});
