import { useQuery } from '@tanstack/react-query';

import { getCoverAssetId, getSummaryTrip, getTripSummary, getTripTimeline } from '../api';

import { timelineKeys } from './use-timeline';

/**
 * S42에 필요한 것: 여행(이름·기간), 요약 값, 경로를 그릴 장소(타임라인), 대표 사진.
 * 여행·요약을 못 받으면 "만들기 실패". 장소·사진을 못 받으면 그 부분만 빈 모양으로 둔다
 */
export function useTripSummary(tripId: string) {
  const trip = useQuery({
    queryKey: ['trips', tripId, 'summary-trip'],
    queryFn: () => getSummaryTrip(tripId),
  });
  const summary = useQuery({
    queryKey: ['trips', tripId, 'summary'],
    queryFn: () => getTripSummary(tripId),
  });
  const places = useQuery({
    queryKey: timelineKeys.trip(tripId),
    queryFn: () => getTripTimeline(tripId),
  });
  const cover = useQuery({
    queryKey: ['trips', tripId, 'cover'],
    queryFn: () => getCoverAssetId(tripId),
  });

  const failed = trip.isError || summary.isError;
  const loading = trip.isPending || summary.isPending;
  return {
    state: failed ? ('error' as const) : loading ? ('loading' as const) : ('ready' as const),
    trip: trip.data ?? null,
    summary: summary.data ?? null,
    // 경로는 실제로 다녀온 곳만 잇는다. 다녀온 곳이 없으면 계획한 곳으로
    route: (() => {
      const items = places.data ?? [];
      const visited = items.filter((p) => p.status === 'VISITED');
      return (visited.length > 0 ? visited : items).map((p) => p.place);
    })(),
    coverAssetId: cover.data ?? null,
    retry: () => {
      if (trip.isError) void trip.refetch();
      if (summary.isError) void summary.refetch();
      if (places.isError) void places.refetch();
      if (cover.isError) void cover.refetch();
    },
  };
}
