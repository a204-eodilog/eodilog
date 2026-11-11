import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { useSeoulToday } from '@/hooks/use-seoul-today';

import { getMyTrips } from '../api';
import { groupTrips, tripListState } from '../trip-rules';
import type { TripSections } from '../types';

export const MY_TRIPS_KEY = ['trips', 'mine'] as const;

/**
 * 여행 탭 목록. 서버는 만든 순서로만 주므로 맨 위 카드·묶음을 바르게 만들려면 여행을 다 받아야 한다.
 * 마지막 쪽까지 이어서 받고, 다 받기 전에는 마지막으로 다 받은 묶음을 보인다(research R7).
 */
export function useMyTrips() {
  const today = useSeoulToday();
  const query = useInfiniteQuery({
    queryKey: MY_TRIPS_KEY,
    queryFn: ({ pageParam }) => getMyTrips(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.page.hasNext ? last.page.nextCursor : undefined),
  });

  const { data, hasNextPage, isFetchingNextPage, isError, fetchNextPage, fetchStatus } = query;

  // 실패하면 더 받지 않고 다시 시도(refetch)를 기다린다. 계속 실패하는 요청을 되풀이하지 않게
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const trips = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const complete = data !== undefined && !hasNextPage;

  // 마지막으로 다 받은 묶음. 렌더 중에 이전 값과 비교해 바꾸는 방식이라 effect를 거치지 않는다.
  // 비교는 쿼리 캐시의 data(같은 응답이면 같은 객체)와 오늘로 한다. 렌더마다 새로 만드는 묶음 객체로
  // 비교하면 렌더 중 setState가 끝없이 반복된다(Too many re-renders)
  const [last, setLast] = useState<{
    data: typeof data;
    today: string;
    sections: TripSections;
  } | null>(null);
  if (complete && (last?.data !== data || last.today !== today)) {
    setLast({ data, today, sections: groupTrips(trips, today) });
  }

  const listState = tripListState({
    complete,
    failed: isError,
    paused: fetchStatus === 'paused',
    lastSections: last?.sections ?? null,
    today,
    trips,
  });

  // 카드의 D-day도 묶음과 같은 오늘로 계산하게 함께 돌려준다
  return { ...query, listState, today };
}
