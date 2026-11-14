import { useQueries, useQuery } from '@tanstack/react-query';

import { useMe } from '@/hooks/use-me';

import { getFriendsBoard } from '@/features/friends/api';
import { FRIENDS_BOARD_KEY } from '@/features/friends/hooks/use-friends';

import { getMyFeeds, getMyTrips, getRegionCode } from '../api';
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
  // 친구 탭(S43)과 같은 캐시를 읽는다. 전에는 팔로잉 수만 따로 받아 "친구"로 보였는데,
  // 친구 탭의 팔로워·팔로잉 수와 달라 보였고 팔로우가 바뀌어도 따로 갱신됐다(2026-11-14 사용자 지적)
  const friends = useQuery({
    queryKey: FRIENDS_BOARD_KEY,
    queryFn: ({ signal }) => getFriendsBoard(signal),
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
  // 지역 코드를 다 받은 뒤 그린다. 지도 처음 맞춤은 한 번만이라 늦게 온 핀이 화면 밖에 남는다(!145 리뷰)
  if (!me.data || !trips.data || codes.some((c) => c.isPending)) return { state: 'loading', retry };

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
    followerCount: friends.data?.followers.length ?? null,
    followingCount: friends.data?.following.length ?? null,
  });
  return { state: summary.visitedCount === 0 ? 'empty' : 'ready', summary, retry };
}
