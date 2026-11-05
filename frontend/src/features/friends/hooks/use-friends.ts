import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui';
import {
  acceptFollowRequest,
  getFriendsBoard,
  rejectFollowRequest,
  removeFollower,
  unfollow,
} from '@/features/friends/api';
import {
  actionUserId,
  applyFriendsAction,
  type FriendsAction,
} from '@/features/friends/friends-rules';
import type { Follow, FriendsBoard } from '@/features/friends/types';

export type FriendsService = {
  load: (signal?: AbortSignal) => Promise<FriendsBoard>;
  execute: (action: FriendsAction) => Promise<Follow | void>;
};
const SERVER: FriendsService = {
  load: getFriendsBoard,
  execute: (a) =>
    a.kind === 'accept'
      ? acceptFollowRequest(a.follow.id)
      : a.kind === 'reject'
        ? rejectFollowRequest(a.follow.id)
        : a.kind === 'unfollow'
          ? unfollow(a.follow.followee.id)
          : removeFollower(a.follow.follower.id),
};
const QUERY_KEY = ['friends', 'board'] as const;
const EMPTY: FriendsBoard = { following: [], followers: [], requests: [] };
const FAILURE = {
  accept: '팔로우 요청을 수락하지 못했어요',
  reject: '팔로우 요청을 거절하지 못했어요',
  unfollow: '팔로우를 해제하지 못했어요',
  remove: '팔로워를 삭제하지 못했어요',
};

export function useFriends(service: FriendsService = SERVER, queryKey: QueryKey = QUERY_KEY) {
  const client = useQueryClient();
  const [pending, setPending] = useState<FriendsAction[]>([]);
  const locks = useRef(new Map<string, FriendsAction>());
  const mounted = useRef(true);
  const [accepted, setAccepted] = useState<Follow | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => service.load(signal),
    enabled: pending.length === 0,
    refetchOnWindowFocus: pending.length === 0,
  });
  const mutation = useMutation({ mutationFn: service.execute, retry: false });

  async function run(action: FriendsAction): Promise<boolean> {
    const userId = actionUserId(action);
    if (!mounted.current || locks.current.has(userId)) return false;
    const current = client.getQueryData<FriendsBoard>(queryKey);
    const source =
      action.kind === 'accept' || action.kind === 'reject'
        ? current?.requests
        : action.kind === 'unfollow'
          ? current?.following
          : current?.followers;
    if (!source?.some((f) => f.id === action.follow.id)) return false;
    locks.current.set(userId, action);
    setPending([...locks.current.values()]);
    try {
      await client.cancelQueries({ queryKey, exact: true });
      const result = await mutation.mutateAsync(action);
      client.setQueryData<FriendsBoard>(queryKey, (old) =>
        applyFriendsAction(old ?? EMPTY, action, result || undefined),
      );
      if (mounted.current) {
        if (action.kind === 'accept') setAccepted(result || action.follow);
        const message =
          action.kind === 'accept'
            ? action.follow.follower.nickname + '님의 팔로우 요청을 수락했어요'
            : action.kind === 'reject'
              ? '팔로우 요청을 거절했어요'
              : action.kind === 'unfollow'
                ? '팔로우를 해제했어요'
                : '팔로워를 삭제했어요';
        toast.success(message);
      }
      return true;
    } catch {
      // 팔로우 API는 버전을 주고받지 않아 실패는 모두 되돌린 뒤 같은 작업으로 다시 시도한다
      if (mounted.current)
        toast.error(FAILURE[action.kind], {
          action: { label: '다시 시도', onPress: () => void run(action) },
        });
      return false;
    } finally {
      // 캐시는 성공 때만 변경한다. 실패한 낙관적 표시만 제거하므로 다른 줄의 성공을 덮어쓰지 않는다.
      locks.current.delete(userId);
      if (mounted.current) setPending([...locks.current.values()]);
    }
  }

  return {
    ...query,
    board: pending.reduce(
      (board, action) => applyFriendsAction(board, action),
      query.data ?? EMPTY,
    ),
    pendingIds: pending.map(actionUserId),
    accepted,
    run,
  };
}
