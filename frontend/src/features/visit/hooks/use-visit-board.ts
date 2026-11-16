import { queryOptions, useQuery } from '@tanstack/react-query';

import { useMe } from '@/hooks/use-me';

import { getItinerary, getMyVisits, getVisitTrip } from '../api';
import type { ItineraryDoc } from '../types';

export const visitKeys = {
  trip: (tripId: string) => ['trips', tripId] as const,
  itinerary: (tripId: string) => ['trips', tripId, 'itinerary'] as const,
  myVisits: (tripId: string) => ['trips', tripId, 'visits', 'me'] as const,
};

/**
 * 코스 항목 읽기. 코스 화면(course)과 쿼리 키가 같아서 캐시에는 코스 전체를 두고 항목만 꺼내 쓴다.
 * 항목 배열만 넣어 두면 나중에 연 코스·날씨 화면이, 코스 전체가 먼저 들어 있으면 이쪽 화면이 멈춘다
 */
export const itineraryItemsQuery = (tripId: string) =>
  queryOptions({
    queryKey: visitKeys.itinerary(tripId),
    queryFn: () => getItinerary(tripId),
    select: (doc: ItineraryDoc) => doc.items,
  });

/** S33에 필요한 것을 한꺼번에 읽는다: 여행(이름·시작일·동행), 코스, 내 방문, 나 */
export function useVisitBoard(tripId: string) {
  const trip = useQuery({
    queryKey: visitKeys.trip(tripId),
    queryFn: () => getVisitTrip(tripId),
  });
  const itinerary = useQuery(itineraryItemsQuery(tripId));
  const visits = useQuery({
    queryKey: visitKeys.myVisits(tripId),
    queryFn: () => getMyVisits(tripId),
  });
  const me = useMe();

  const queries = [trip, itinerary, visits, me];

  return {
    trip: trip.data,
    items: itinerary.data ?? [],
    visits: visits.data ?? [],
    myUserId: me.data?.id ?? null,
    isLoading: queries.some((q) => q.isPending),
    // 보이던 자료가 있으면 다시 받기가 한 번 실패해도 화면을 오류로 바꾸지 않는다(받은 적 없을 때만 오류)
    error: queries.find((q) => q.isError && q.data === undefined)?.error ?? null,
    refetch: () => Promise.all(queries.map((q) => q.refetch())),
  };
}
