import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { toApiError } from '@/api/errors';
import { getItinerary } from '@/features/course/api';
import { itineraryKey } from '@/features/course/hooks/course-keys';

import { placeNamesOfDay } from '../trip-rules';

/**
 * 여행 중인 여행의 오늘 갈 곳 이름. 여행 상세(S17)의 오늘 코스 한 줄에 쓴다.
 * day가 null(여행 중이 아님)이면 코스를 받지 않는다. 받는 중이거나 받지 못했으면 null이다.
 * 코스 화면과 같은 캐시를 써서 코스를 고치고 돌아오면 바로 맞는다
 */
export function useTodayPlaces(tripId: string, day: number | null): string[] | null {
  return useTodayRoute(tripId, day).places;
}

/**
 * 오늘 갈 곳과, 그 값을 처음 받는 중인지. 여행 탭 맨 위 카드가 쓴다.
 * 받는 중(loading)과 오늘 갈 곳이 없는 것(places가 빈 배열)을 가려야, 받는 동안 다른 모습을 먼저 그렸다가
 * 바꾸지 않는다. 받아 둔 코스가 있으면 받는 중이 아니다. 연결이 끊겨 멈춘 것도 받는 중으로 보지 않는다
 */
export function useTodayRoute(
  tripId: string,
  day: number | null,
): { places: string[] | null; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: itineraryKey(tripId),
    queryFn: ({ signal }) => getItinerary(tripId, signal),
    enabled: day !== null,
    retry: (count, e) => {
      const { status } = toApiError(e);
      return status !== 404 && status !== 400 && count < 1;
    },
  });

  const items = data?.items;
  const places = useMemo(
    () => (day !== null && Array.isArray(items) ? placeNamesOfDay(items, day) : null),
    [items, day],
  );
  return { places, loading: day !== null && isLoading };
}
