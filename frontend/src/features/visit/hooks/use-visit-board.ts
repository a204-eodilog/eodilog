import { useQuery } from '@tanstack/react-query';

import { getItineraryItems, getMe, getMyVisits, getVisitTrip } from '../api';

export const visitKeys = {
  trip: (tripId: string) => ['trips', tripId] as const,
  itinerary: (tripId: string) => ['trips', tripId, 'itinerary'] as const,
  myVisits: (tripId: string) => ['trips', tripId, 'visits', 'me'] as const,
};

/** S33에 필요한 것을 한꺼번에 읽는다: 여행(이름·시작일·동행), 코스, 내 방문, 나 */
export function useVisitBoard(tripId: string) {
  const trip = useQuery({
    queryKey: visitKeys.trip(tripId),
    queryFn: () => getVisitTrip(tripId),
  });
  const itinerary = useQuery({
    queryKey: visitKeys.itinerary(tripId),
    queryFn: () => getItineraryItems(tripId),
  });
  const visits = useQuery({
    queryKey: visitKeys.myVisits(tripId),
    queryFn: () => getMyVisits(tripId),
  });
  const me = useQuery({ queryKey: ['me'], queryFn: getMe });

  const queries = [trip, itinerary, visits, me];

  return {
    trip: trip.data,
    items: itinerary.data ?? [],
    visits: visits.data ?? [],
    myUserId: me.data?.id ?? null,
    isLoading: queries.some((q) => q.isPending),
    error: queries.find((q) => q.isError)?.error ?? null,
    refetch: () => Promise.all(queries.map((q) => q.refetch())),
  };
}
