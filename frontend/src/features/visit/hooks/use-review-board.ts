import { useQuery } from '@tanstack/react-query';

import { useMe } from '@/hooks/use-me';

import { getMyVisits, getTripReviews, getVisitTrip } from '../api';

import { itineraryItemsQuery, visitKeys } from './use-visit-board';

export const reviewKeys = {
  trip: (tripId: string) => ['trips', tripId, 'reviews'] as const,
};

/**
 * S34에 필요한 것을 한꺼번에 읽는다: 여행(이름·시작일·동행), 코스(장소 이름·일차), 내 방문, 여행 평가 전부, 나.
 * 방문 하나를 따로 읽는 API가 없어 내 방문 목록에서 찾는다. S33과 같은 쿼리 키라 캐시를 같이 쓴다
 */
export function useReviewBoard(tripId: string, visitId: string) {
  const trip = useQuery({
    queryKey: visitKeys.trip(tripId),
    queryFn: () => getVisitTrip(tripId),
  });
  const itinerary = useQuery(itineraryItemsQuery(tripId));
  const visits = useQuery({
    queryKey: visitKeys.myVisits(tripId),
    queryFn: () => getMyVisits(tripId),
  });
  const reviews = useQuery({
    queryKey: reviewKeys.trip(tripId),
    queryFn: () => getTripReviews(tripId),
  });
  const me = useMe();

  const queries = [trip, itinerary, visits, reviews, me];

  return {
    trip: trip.data,
    items: itinerary.data ?? [],
    /** 내 방문 중 이 방문. 목록을 다 읽었는데 없으면 null(해제했거나 남의 방문) */
    visit: visits.data ? (visits.data.find((v) => v.id === visitId) ?? null) : undefined,
    reviews: reviews.data ?? [],
    myUserId: me.data?.id ?? null,
    isLoading: queries.some((q) => q.isPending),
    // 보이던 자료가 있으면 다시 받기가 한 번 실패해도 화면을 오류로 바꾸지 않는다(받은 적 없을 때만 오류)
    error: queries.find((q) => q.isError && q.data === undefined)?.error ?? null,
    refetch: () => Promise.all(queries.map((q) => q.refetch())),
  };
}
