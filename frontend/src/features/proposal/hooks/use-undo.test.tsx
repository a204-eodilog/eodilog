import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { toast } from '@/components/ui';
import { getItinerary } from '@/features/course/api';
import { itineraryKey } from '@/features/course/hooks/course-keys';
import { httpError, sampleCourse } from '@/features/course/testing';

import { undoApply } from '../api';

import { useUndo } from './use-undo';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('@/features/course/api', () => ({ getItinerary: jest.fn() }));
jest.mock('../api', () => ({ undoApply: jest.fn() }));
jest.mock('@/components/ui', () => ({
  toast: { show: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

const mockGet = jest.mocked(getItinerary);
const mockUndo = jest.mocked(undoApply);

async function setup() {
  // 앱과 같이 30초 안에는 받아 둔 값을 새것으로 본다
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 30_000 } },
  });
  client.setQueryData(itineraryKey('trip-1'), { ...sampleCourse(true), version: 4 });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(() => useUndo('trip-1'), { wrapper });
  return { client, undo: result.current };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('되돌리기', () => {
  it('받아 둔 코스가 새것이어도 서버에서 지금 version을 받아 보낸다', async () => {
    mockGet.mockResolvedValue({ ...sampleCourse(true), version: 6 });
    mockUndo.mockResolvedValue({ ...sampleCourse(true), version: 7 });
    const { undo } = await setup();
    await act(async () => {
      await undo('job-p');
    });
    expect(mockUndo).toHaveBeenCalledWith('trip-1', 6, 'job-p');
  });

  it('그 사이 동행이 코스를 바꿔 VERSION_CONFLICT여도 되돌릴 수 없다고 알리고 코스를 다시 받게 한다', async () => {
    mockGet.mockResolvedValue({ ...sampleCourse(true), version: 6 });
    mockUndo.mockRejectedValue(httpError(409, 'VERSION_CONFLICT'));
    const { client, undo } = await setup();
    let result = '';
    await act(async () => {
      result = await undo('job-p');
    });
    expect(result).toBe('unavailable');
    expect(toast.show).toHaveBeenCalledWith('그 사이 코스가 바뀌어 되돌릴 수 없어요');
    expect(client.getQueryState(itineraryKey('trip-1'))?.isInvalidated).toBe(true);
  });
});
