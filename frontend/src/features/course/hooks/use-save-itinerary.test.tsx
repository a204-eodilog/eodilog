import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { getItinerary, replaceItinerary } from '../api';
import { toDraft } from '../course-rules';
import { httpError, sampleCourse } from '../testing';

import { itineraryKey } from './course-keys';
import { useSaveItinerary } from './use-save-itinerary';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('../api', () => ({ getItinerary: jest.fn(), replaceItinerary: jest.fn() }));
jest.mock('@/components/ui', () => ({ toast: { show: jest.fn(), error: jest.fn() } }));

const mockGet = jest.mocked(getItinerary);
const mockPut = jest.mocked(replaceItinerary);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('코스 저장 충돌', () => {
  it('받아 둔 코스가 아직 새것이어도 충돌 뒤에는 서버에서 최신 코스를 다시 받는다', async () => {
    // 앱과 같은 기본값: 30초 안에는 받아 둔 값을 새것으로 본다
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 30_000 } },
    });
    const mine = sampleCourse(true);
    client.setQueryData(itineraryKey('trip-1'), mine);
    const theirs = { ...sampleCourse(true), version: mine.version + 1 };
    mockPut.mockRejectedValue(httpError(409, 'VERSION_CONFLICT'));
    mockGet.mockResolvedValue(theirs);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = await renderHook(() => useSaveItinerary('trip-1'), { wrapper });

    const draft = toDraft(mine, 2);
    draft.days[0] = draft.days[0].slice(1);
    let saved: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saved = await result.current.save(draft, mine);
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(saved).toEqual({ kind: 'conflict', latest: theirs });
  });
});
