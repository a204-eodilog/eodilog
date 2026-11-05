import { useQuery } from '@tanstack/react-query';

import { koreaBbox } from '@/lib/korea-map';

import { getDiscovery, getHomeMap, getUnreadCount, hasAnyFollowing, hasAnyTrip } from '../api';
import { homeState, toRecommendations, toRegionMarks } from '../home-rules';

const KEYS = {
  // 내 여행 목록(['me', 'trips'])과 같은 머리를 써서, 여행을 만들거나 나가면 함께 새로 받는다
  trip: ['me', 'trips', 'home-has-trip'] as const,
  map: ['home', 'map'] as const,
  following: ['home', 'has-following'] as const,
  discovery: ['home', 'discovery'] as const,
  unread: ['me', 'notification-summary'] as const,
};

/** S05 실제 화면의 값. 서버 응답은 home-rules에서 화면 값으로 바꾼다 */
export function useHome() {
  const trip = useQuery({ queryKey: KEYS.trip, queryFn: hasAnyTrip });
  const map = useQuery({
    queryKey: KEYS.map,
    queryFn: async () => toRegionMarks(await getHomeMap(koreaBbox())),
    enabled: trip.data === true,
    retry: false,
  });
  // 아래 셋은 없어도 지도는 보여 준다. 실패하면 모름/0으로 둔다
  const following = useQuery({ queryKey: KEYS.following, queryFn: hasAnyFollowing, retry: false });
  const discovery = useQuery({
    queryKey: KEYS.discovery,
    queryFn: async () => toRecommendations(await getDiscovery()),
    enabled: map.isSuccess,
    retry: false,
  });
  const unread = useQuery({ queryKey: KEYS.unread, queryFn: getUnreadCount, retry: false });

  const state = trip.isError
    ? 'error'
    : homeState({
        hasTrip: trip.data,
        mapFailed: map.isError,
        following: following.isSuccess ? following.data : null,
        marks: map.data,
      });

  return {
    state,
    marks: map.data ?? [],
    recommendations: discovery.data ?? [],
    unreadCount: unread.data ?? 0,
    retry: () => {
      void trip.refetch();
      void map.refetch();
    },
  };
}
