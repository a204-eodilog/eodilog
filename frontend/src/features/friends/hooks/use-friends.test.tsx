import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { toast } from '@/components/ui';
import { useFriends, type FriendsService } from '@/features/friends/hooks/use-friends';
import { PREVIEW_BOARD } from '@/features/friends/preview-data';
import type { Follow, FriendsBoard } from '@/features/friends/types';

jest.mock('@/components/ui', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('@/features/friends/api', () => ({}));
const clients: QueryClient[] = [];
afterEach(() => {
  clients.forEach((c) => c.clear());
  clients.length = 0;
  jest.clearAllMocks();
});
function deferred() {
  let resolve!: (result: Follow | void) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Follow | void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function setup(execute: FriendsService['execute']) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  clients.push(client);
  client.setQueryData(['friends', 'test'], PREVIEW_BOARD);
  const service: FriendsService = { load: async () => PREVIEW_BOARD, execute };
  const key = ['friends', 'test'];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = await renderHook(() => useFriends(service, key), { wrapper });
  return { ...hook, client };
}
describe('친구 목록 낙관적 변경', () => {
  it('수락을 먼저 표시하고 실패 시 원래 요청으로 돌아오며 재시도한다', async () => {
    const first = deferred();
    let calls = 0;
    const { result, unmount } = await setup(async () => {
      calls++;
      if (calls === 1) return first.promise;
      return {
        ...PREVIEW_BOARD.requests[0],
        status: 'ACCEPTED',
        acceptedAt: '2026-11-18T00:00:00Z',
      };
    });
    let request!: Promise<boolean>;
    await act(() => {
      request = result.current.run({
        kind: 'accept',
        follow: PREVIEW_BOARD.requests[0],
        at: '2026-11-18T00:00:00Z',
      });
    });
    expect(result.current.board.requests).toHaveLength(0);
    expect(result.current.board.followers).toHaveLength(6);
    await act(async () => {
      first.reject(new Error('network'));
      await request;
    });
    expect(result.current.board.requests).toHaveLength(1);
    expect(result.current.board.followers).toHaveLength(5);
    expect(result.current.pendingIds).toEqual([]);
    const retry = (jest.mocked(toast.error).mock.calls[0][1] as { action: { onPress: () => void } })
      .action.onPress;
    await act(async () => {
      retry();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.board.requests).toHaveLength(0);
    expect(result.current.board.following).toHaveLength(5);
    await unmount();
  });
  it('같은 사람의 연타를 막고 다른 줄의 성공을 실패 복원으로 덮지 않는다', async () => {
    const first = deferred();
    let calls = 0;
    const { result, client, unmount } = await setup(async (action) => {
      calls++;
      if (action.follow.id === 'out-0') return first.promise;
    });
    const action = { kind: 'unfollow' as const, follow: PREVIEW_BOARD.following[0], at: '' };
    let pending!: Promise<boolean>;
    await act(() => {
      pending = result.current.run(action);
    });
    await act(async () => {
      expect(await result.current.run(action)).toBe(false);
      await result.current.run({ ...action, follow: PREVIEW_BOARD.following[1] });
    });
    expect(calls).toBe(2);
    await act(async () => {
      first.reject(new Error('network'));
      await pending;
    });
    expect(result.current.board.following.map((f) => f.id)).toEqual([
      'out-0',
      'out-2',
      'out-3',
      'out-4',
    ]);
    expect(client.getQueryData<FriendsBoard>(['friends', 'test'])?.following).toHaveLength(4);
    await unmount();
  });

  it.each(['reject', 'remove'] as const)('%s 실패 시 순서와 다른 방향을 보존한다', async (kind) => {
    const { result, unmount } = await setup(async () => {
      throw new Error('network');
    });
    const follow = kind === 'reject' ? PREVIEW_BOARD.requests[0] : PREVIEW_BOARD.followers[0];
    await act(async () => {
      expect(await result.current.run({ kind, follow, at: '' })).toBe(false);
    });
    expect(result.current.board).toEqual(PREVIEW_BOARD);
    expect(toast.error).toHaveBeenCalled();
    await unmount();
  });
});

describe('팔로우 해제 뒤 홈 지도', () => {
  it('팔로우를 끊으면 홈 자료에 새로 받기 표시를 하고, 수락은 홈을 건드리지 않는다', async () => {
    const { result, client, unmount } = await setup(async () => undefined);
    client.setQueryData(['home', 'map'], []);
    await act(async () => {
      await result.current.run({ kind: 'accept', follow: PREVIEW_BOARD.requests[0], at: '' });
    });
    expect(client.getQueryState(['home', 'map'])?.isInvalidated).toBe(false);
    await act(async () => {
      await result.current.run({ kind: 'unfollow', follow: PREVIEW_BOARD.following[0], at: '' });
    });
    expect(client.getQueryState(['home', 'map'])?.isInvalidated).toBe(true);
    await unmount();
  });
});
