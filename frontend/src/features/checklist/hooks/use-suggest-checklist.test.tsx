import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { toast } from '@/components/ui';

import { adoptSuggestion, getSuggestionJob, requestSuggestions } from '../api';
import { checklistItem, httpError, networkError, suggestion, suggestionJob } from '../testing';
import type { ChecklistItem, JobRef } from '../types';

import { checklistKey } from './checklist-keys';
import { SUGGEST_POLL_MS, SUGGEST_TIMEOUT_MS, useSuggestChecklist } from './use-suggest-checklist';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));

let mockKeySeq = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => {
    mockKeySeq += 1;
    return `key-${mockKeySeq}`;
  },
}));

jest.mock('../api', () => ({
  getChecklist: jest.fn(),
  adoptSuggestion: jest.fn(),
  requestSuggestions: jest.fn(),
  getSuggestionJob: jest.fn(),
}));

jest.mock('@/components/ui', () => ({
  toast: { show: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

const mockRequest = jest.mocked(requestSuggestions);
const mockJob = jest.mocked(getSuggestionJob);
const mockAdopt = jest.mocked(adoptSuggestion);

const REF: JobRef = { jobId: 'job-1', status: 'QUEUED', statusUrl: '/api/v1/jobs/job-1' };

let client: QueryClient;

async function renderSuggest() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSuggestChecklist('trip-1'), { wrapper });
}

/** 기다림을 끝까지 흘려보낸다 */
async function flush(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockKeySeq = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData<ChecklistItem[]>(checklistKey('trip-1'), [
    checklistItem({ id: 'umbrella', label: '우산' }),
    checklistItem({ id: 'pill', label: '멀미약 2개', source: 'AI', modifiedByUser: true }),
  ]);
  mockRequest.mockResolvedValue(REF);
  mockAdopt.mockImplementation(async (_trip, input) =>
    checklistItem({ id: `new-${input.suggestionIndex}`, label: input.label, source: 'AI' }),
  );
});

afterEach(() => {
  jest.useRealTimers();
});

describe('다시 제안 받기', () => {
  it('작업이 끝날 때까지 기다린 뒤 지금 목록에 없는 이름만 차례로 채택한다', async () => {
    mockJob.mockResolvedValueOnce(suggestionJob({ status: 'RUNNING' })).mockResolvedValueOnce(
      suggestionJob({
        status: 'SUCCEEDED',
        result: {
          items: [suggestion('우산'), suggestion('선크림', '자외선 강함'), suggestion('물티슈')],
        },
      }),
    );
    const { result } = await renderSuggest();
    await act(async () => {
      void result.current.start();
    });
    expect(result.current.suggesting).toBe(true);
    await flush(SUGGEST_POLL_MS);

    expect(mockRequest).toHaveBeenCalledWith('trip-1', 'key-1');
    expect(mockAdopt.mock.calls.map(([, input]) => input)).toEqual([
      { label: '선크림', sourceJobId: 'job-1', suggestionIndex: 1 },
      { label: '물티슈', sourceJobId: 'job-1', suggestionIndex: 2 },
    ]);
    const list = client.getQueryData<ChecklistItem[]>(checklistKey('trip-1')) ?? [];
    expect(list.map((i) => i.label)).toEqual(['우산', '멀미약 2개', '선크림', '물티슈']);
    expect(list[1].modifiedByUser).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('준비물 2개를 더했어요');
    expect(result.current.suggesting).toBe(false);
    expect(result.current.failure).toBeNull();
  });

  it('더할 것이 없으면 그렇게 알린다', async () => {
    mockJob.mockResolvedValue(
      suggestionJob({ status: 'SUCCEEDED', result: { items: [suggestion('우산')] } }),
    );
    const { result } = await renderSuggest();
    await act(async () => {
      await result.current.start();
    });
    expect(mockAdopt).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('새로 더할 준비물이 없어요');
  });

  it.each(['FAILED', 'CANCELLED'] as const)(
    '작업이 %s면 목록은 그대로 두고 실패를 알린다',
    async (status) => {
      mockJob.mockResolvedValue(suggestionJob({ status }));
      const { result } = await renderSuggest();
      await act(async () => {
        await result.current.start();
      });
      expect(result.current.failure).toBe('general');
      expect(client.getQueryData<ChecklistItem[]>(checklistKey('trip-1'))).toHaveLength(2);
    },
  );

  it('추천 설정이 꺼져 있으면 꺼짐으로 알린다', async () => {
    mockRequest.mockRejectedValue(httpError(409, 'AI_FEATURE_DISABLED'));
    const { result } = await renderSuggest();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.failure).toBe('disabled');
    expect(mockJob).not.toHaveBeenCalled();
  });

  it('2분이 넘도록 끝나지 않으면 실패로 본다', async () => {
    mockJob.mockResolvedValue(suggestionJob({ status: 'RUNNING' }));
    const { result } = await renderSuggest();
    await act(async () => {
      void result.current.start();
    });
    await flush(SUGGEST_TIMEOUT_MS + SUGGEST_POLL_MS * 2);
    expect(result.current.failure).toBe('general');
    expect(result.current.suggesting).toBe(false);
  });

  it('요청이 처리 중이라는 답이면 같은 키로 한 번 더 보낸다', async () => {
    mockRequest.mockRejectedValueOnce(httpError(409, 'REQUEST_IN_PROGRESS')).mockResolvedValue(REF);
    mockJob.mockResolvedValue(suggestionJob({ status: 'SUCCEEDED', result: { items: [] } }));
    const { result } = await renderSuggest();
    await act(async () => {
      void result.current.start();
    });
    await flush(1000);
    expect(mockRequest.mock.calls).toEqual([
      ['trip-1', 'key-1'],
      ['trip-1', 'key-1'],
    ]);
    expect(result.current.failure).toBeNull();
  });

  it('기다리는 중에 다시 눌러도 요청은 하나다', async () => {
    mockJob.mockResolvedValue(suggestionJob({ status: 'RUNNING' }));
    const { result } = await renderSuggest();
    await act(async () => {
      void result.current.start();
      void result.current.start();
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('응답을 놓쳐 다시 누르면 같은 키로 보내고, 작업을 받은 뒤에는 새 키를 쓴다', async () => {
    mockRequest.mockRejectedValueOnce(networkError()).mockResolvedValue(REF);
    mockJob.mockResolvedValue(suggestionJob({ status: 'SUCCEEDED', result: { items: [] } }));
    const { result } = await renderSuggest();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.failure).toBe('general');
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.start();
    });
    expect(mockRequest.mock.calls.map(([, key]) => key)).toEqual(['key-1', 'key-1', 'key-2']);
  });

  it('서버가 답한 실패 뒤에는 새 키를 쓴다', async () => {
    mockRequest.mockRejectedValueOnce(httpError(409, 'AI_FEATURE_DISABLED')).mockResolvedValue(REF);
    mockJob.mockResolvedValue(suggestionJob({ status: 'SUCCEEDED', result: { items: [] } }));
    const { result } = await renderSuggest();
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.start();
    });
    expect(mockRequest.mock.calls.map(([, key]) => key)).toEqual(['key-1', 'key-2']);
  });

  it('화면을 나가면 기다림을 멈추고 결과를 더하지 않는다', async () => {
    mockJob.mockResolvedValue(suggestionJob({ status: 'RUNNING' }));
    const { result, unmount } = await renderSuggest();
    await act(async () => {
      void result.current.start();
    });
    const calls = mockJob.mock.calls.length;
    unmount();
    await flush(SUGGEST_POLL_MS * 3);
    expect(mockJob.mock.calls.length).toBe(calls);
    expect(mockAdopt).not.toHaveBeenCalled();
  });
});
