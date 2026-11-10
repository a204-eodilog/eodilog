import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { getPoll, replaceBallot } from '../api';
import { candidate, poll } from '../testing';
import type { Poll } from '../types';
import { useBallot } from './use-ballot';
import { usePoll } from './use-poll';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('../api', () => ({ getPoll: jest.fn(), replaceBallot: jest.fn() }));
const mockToast = { show: jest.fn() };
jest.mock('@/components/ui', () => ({
  get toast() {
    return mockToast;
  },
}));

const mockGetPoll = jest.mocked(getPoll);
const mockReplace = jest.mocked(replaceBallot);

function httpError(status: number, code: string) {
  return Object.assign(new Error(code), {
    isAxiosError: true,
    response: { status, data: { error: { code, message: code } } },
  });
}

/** 서버 흉내: 받은 선택으로 내 선택을 바꾸고 표 수를 다시 센다 */
function serverAccept(base: Poll) {
  return async (_t: string, _p: string, ids: string[]) => ({
    ...base,
    myCandidateIds: ids,
    votedMemberCount: ids.length > 0 ? 1 : 0,
    candidates: base.candidates.map((c) => ({ ...c, voteCount: ids.includes(c.id) ? 1 : 0 })),
  });
}

function setup(initial: Poll) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  mockGetPoll.mockResolvedValue(initial);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => {
      const q = usePoll('trip-1', initial.id);
      return useBallot('trip-1', q.data);
    },
    { wrapper },
  );
}

const base = poll({
  candidates: [candidate('c1'), candidate('c2'), candidate('c3')],
  myCandidateIds: [],
  votedMemberCount: 0,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useBallot', () => {
  it('누르면 서버를 기다리지 않고 표 수와 내 선택이 바뀐다', async () => {
    mockReplace.mockImplementation(() => new Promise(() => undefined));
    const { result } = await setup(base);
    await waitFor(() => expect(result.current.view).toBeDefined());
    await act(() => result.current.toggle('c1'));
    expect(result.current.selected).toEqual(['c1']);
    expect(result.current.view?.candidates[0].voteCount).toBe(1);
    expect(result.current.view?.votedMemberCount).toBe(1);
  });

  it('요청 중에 10번 눌러도 요청은 2번이고 마지막 선택이 저장된다', async () => {
    let release: () => void = () => undefined;
    mockReplace.mockImplementationOnce(
      (t, p, ids) =>
        new Promise((resolve) => {
          release = () => void serverAccept(base)(t, p, ids).then(resolve);
        }),
    );
    mockReplace.mockImplementation(serverAccept(base));
    const { result } = await setup(base);
    await waitFor(() => expect(result.current.view).toBeDefined());

    await act(() => result.current.toggle('c1'));
    for (const id of ['c2', 'c1', 'c3', 'c2', 'c3', 'c1', 'c2', 'c1', 'c3']) {
      await act(() => result.current.toggle(id));
    }
    const finalSelection = result.current.selected;
    await act(async () => release());
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(2));
    expect([...mockReplace.mock.calls[1][2]].sort()).toEqual([...finalSelection].sort());
    console.log(`[measure] 후보 10번 누름 → ballot 요청 ${mockReplace.mock.calls.length}번`);
  });

  it('후보가 추가돼 409 VERSION_CONFLICT면 저장된 선택을 보이고, 다시 시도는 최신 version으로 고르려던 선택을 보낸다', async () => {
    const savedBusan = { ...base, myCandidateIds: ['c1'], votedMemberCount: 1 };
    const bumped = {
      ...savedBusan,
      version: 2,
      candidates: [...savedBusan.candidates, candidate('c4', { addedAt: '2026-10-26T13:00:00Z' })],
    };
    mockReplace.mockRejectedValueOnce(httpError(409, 'VERSION_CONFLICT'));
    const { result } = await setup(savedBusan);
    await waitFor(() => expect(result.current.view).toBeDefined());

    mockGetPoll.mockResolvedValue(bumped);
    await act(() => result.current.toggle('c2'));
    await waitFor(() => expect(result.current.failure?.kind).toBe('conflict'));
    expect(result.current.failure?.wanted).toEqual(['c1', 'c2']);
    expect(result.current.selected).toEqual(['c1']);
    await waitFor(() => expect(result.current.view?.candidates).toHaveLength(4));

    mockReplace.mockImplementation(serverAccept(bumped));
    await act(() => result.current.retry());
    await waitFor(() => expect(result.current.failure).toBeNull());
    expect(mockReplace.mock.calls[1][3]).toBe(2);
    expect(mockReplace.mock.calls[1][2]).toEqual(['c1', 'c2']);
  });

  it('409 POLL_CLOSED면 다시 받고 마감 안내를 띄운다', async () => {
    mockReplace.mockRejectedValueOnce(httpError(409, 'POLL_CLOSED'));
    const { result } = await setup(base);
    await waitFor(() => expect(result.current.view).toBeDefined());
    mockGetPoll.mockResolvedValue({ ...base, status: 'CLOSED', closedReason: 'NO_VOTES' });
    await act(() => result.current.toggle('c1'));
    await waitFor(() => expect(mockToast.show).toHaveBeenCalledWith('투표가 마감됐어요'));
    await waitFor(() => expect(result.current.view?.status).toBe('CLOSED'));
    expect(result.current.failure).toBeNull();
  });

  it('연결이 끊기면 저장된 선택으로 되돌리고 실패를 남긴다', async () => {
    mockReplace.mockRejectedValueOnce(new Error('Network Error'));
    const { result } = await setup(base);
    await waitFor(() => expect(result.current.view).toBeDefined());
    await act(() => result.current.toggle('c3'));
    await waitFor(() => expect(result.current.failure?.kind).toBe('network'));
    expect(result.current.selected).toEqual([]);
    expect(result.current.view?.candidates[2].voteCount).toBe(0);
  });
});
