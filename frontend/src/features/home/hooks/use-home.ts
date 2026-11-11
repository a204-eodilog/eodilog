import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

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

  // 다른 화면에서 홈 자료에 "새로 받아야 함" 표시만 해 둔 것(팔로우 등)은 홈으로 돌아올 때 받는다.
  // 그래야 새로 생긴 지역이 사람이 보는 앞에서 물든다. 표시 없는 자료는 탭을 오갈 때마다 다시 받지 않는다
  const queryClient = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      void queryClient.refetchQueries({
        queryKey: ['home'],
        type: 'active',
        predicate: (q) => q.state.isInvalidated,
      });
    }, [queryClient]),
  );

  const state = trip.isError
    ? 'error'
    : homeState({
        hasTrip: trip.data,
        mapFailed: map.isError,
        following: following.isSuccess ? following.data : following.isError ? null : undefined,
        marks: map.data,
      });

  return {
    state,
    marks: map.data ?? [],
    recommendations: discovery.data ?? [],
    recommendationsStatus: discovery.isError
      ? ('error' as const)
      : discovery.data
        ? ('ready' as const)
        : ('loading' as const),
    unreadCount: unread.data ?? 0,
    retry: () => {
      void trip.refetch();
      void map.refetch();
    },
  };
}
