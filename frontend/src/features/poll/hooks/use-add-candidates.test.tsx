import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { addCandidate, getPoll } from '../api';
import { candidate, poll } from '../testing';
import type { Poll } from '../types';
import { pollKey } from './poll-keys';
import { useAddCandidates } from './use-add-candidates';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('../api', () => ({ addCandidate: jest.fn(), getPoll: jest.fn() }));

const mockAdd = jest.mocked(addCandidate);
const mockGet = jest.mocked(getPoll);

function httpError(status: number, code: string) {
  return Object.assign(new Error(code), {
    isAxiosError: true,
    response: { status, data: { error: { code, message: code } } },
  });
}

const base = poll({ candidates: [candidate('c1', { regionId: 'busan' })] });
const withRegion = (p: Poll, id: string, regionId: string, version: number): Poll => ({
  ...p,
  version,
  candidates: [...p.candidates, candidate(id, { regionId })],
});

async function setup(initial: Poll) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  client.setQueryData(pollKey('trip-1', initial.id), initial);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  // 이 버전의 renderHook은 Promise를 돌려준다
  const hook = await renderHook(() => useAddCandidates('trip-1', initial.id), { wrapper });
  return { ...hook, client };
}

beforeEach(() => jest.clearAllMocks());

describe('useAddCandidates', () => {
  it('고른 후보를 차례로 넣고 매번 받은 version으로 다음을 넣는다', async () => {
    const one = withRegion(base, 'c2', 'gangneung', 2);
    const two = withRegion(one, 'c3', 'yeosu', 3);
    mockAdd.mockResolvedValueOnce(one).mockResolvedValueOnce(two);
    const { result, client } = await setup(base);
    let out;
    await act(async () => {
      out = await result.current.mutateAsync([{ regionId: 'gangneung' }, { regionId: 'yeosu' }]);
    });
    expect(out).toEqual({ added: 2, skipped: 0, closed: false });
    expect(mockAdd.mock.calls.map((c) => c[3])).toEqual([1, 2]);
    expect(client.getQueryData<Poll>(pollKey('trip-1', base.id))?.candidates).toHaveLength(3);
  });

  it('다른 동행이 먼저 넣어 409 VERSION_CONFLICT면 다시 받아 그 버전으로 한 번 더 넣는다', async () => {
    const byOther = withRegion(base, 'cx', 'jeju', 2);
    mockAdd
      .mockRejectedValueOnce(httpError(409, 'VERSION_CONFLICT'))
      .mockResolvedValueOnce(withRegion(byOther, 'c2', 'gangneung', 3));
    mockGet.mockResolvedValueOnce(byOther);
    const { result } = await setup(base);
    let out;
    await act(async () => {
      out = await result.current.mutateAsync([{ regionId: 'gangneung' }]);
    });
    expect(out).toEqual({ added: 1, skipped: 0, closed: false });
    expect(mockAdd).toHaveBeenLastCalledWith('trip-1', base.id, { regionId: 'gangneung' }, 2);
  });

  it('충돌 뒤 다시 받았더니 같은 곳이 이미 들어갔으면 건너뛴다', async () => {
    mockAdd.mockRejectedValueOnce(httpError(409, 'VERSION_CONFLICT'));
    mockGet.mockResolvedValueOnce(withRegion(base, 'c2', 'gangneung', 2));
    const { result } = await setup(base);
    let out;
    await act(async () => {
      out = await result.current.mutateAsync([{ regionId: 'gangneung' }]);
    });
    expect(out).toEqual({ added: 0, skipped: 1, closed: false });
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  it('이미 후보인 곳은 요청하지 않고, 400은 그 후보만 건너뛴다', async () => {
    mockAdd
      .mockRejectedValueOnce(httpError(400, 'VALIDATION_ERROR'))
      .mockResolvedValueOnce(withRegion(base, 'c3', 'yeosu', 2));
    const { result } = await setup(base);
    let out;
    await act(async () => {
      out = await result.current.mutateAsync([
        { regionId: 'busan' },
        { regionId: 'jeju' },
        { regionId: 'yeosu' },
      ]);
    });
    expect(out).toEqual({ added: 1, skipped: 2, closed: false });
    expect(mockAdd).toHaveBeenCalledTimes(2);
  });

  it('409 POLL_CLOSED면 멈추고 마감을 알린다', async () => {
    mockAdd.mockRejectedValueOnce(httpError(409, 'POLL_CLOSED'));
    mockGet.mockResolvedValue({ ...base, status: 'CLOSED' });
    const { result } = await setup(base);
    let out;
    await act(async () => {
      out = await result.current.mutateAsync([{ regionId: 'gangneung' }, { regionId: 'yeosu' }]);
    });
    expect(out).toEqual({ added: 0, skipped: 0, closed: true });
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });
});
