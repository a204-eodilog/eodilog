import { useQueries, useQuery } from '@tanstack/react-query';

import { useMe } from '@/hooks/use-me';

import { getFollowingCount, getMyFeeds, getMyTrips, getRegionCode } from '../api';
import { regionIdsToLookUp, toMyPageSummary } from '../mypage-rules';
import type { MyPageSummary } from '../types';

export type MyPageState = 'loading' | 'error' | 'empty' | 'ready';

/**
 * S37 실제 화면의 값. 여행 목록 키는 ['me', 'trips', ...] 아래에 두어
 * 여행을 만들거나 나가면 함께 새로 받는다(trip-cache.invalidateTripLists)
 */
export function useMyPage(): { state: MyPageState; summary?: MyPageSummary; retry: () => void } {
  const me = useMe();
  const trips = useQuery({ queryKey: ['me', 'trips', 'mypage'], queryFn: getMyTrips });
  const feeds = useQuery({ queryKey: ['me', 'feeds'], queryFn: getMyFeeds, retry: false });
  const friends = useQuery({
    queryKey: ['me', 'following-count'],
    queryFn: getFollowingCount,
    retry: false,
  });

  const ids = trips.data ? regionIdsToLookUp(trips.data, feeds.data ?? []) : [];
  const codes = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['regions', id, 'code'],
      queryFn: () => getRegionCode(id),
      staleTime: Infinity,
      retry: false,
    })),
  });

  const retry = () => {
    void me.refetch();
    void trips.refetch();
    void feeds.refetch();
  };
  if (me.isError || trips.isError) return { state: 'error', retry };
  if (!me.data || !trips.data) return { state: 'loading', retry };

  const regionCodes = new Map<string, string>();
  ids.forEach((id, i) => {
    const code = codes[i]?.data;
    if (code) regionCodes.set(id, code);
  });
  const summary = toMyPageSummary({
    nickname: me.data.nickname,
    profileImageUrl: me.data.profileImageUrl,
    trips: trips.data,
    // 게시 목록을 못 받아도 화면은 보인다(모두 나만 봐요로)
    feeds: feeds.data ?? [],
    regionCodes,
    friendCount: friends.data ?? null,
  });
  return { state: summary.visitedCount === 0 ? 'empty' : 'ready', summary, retry };
}
