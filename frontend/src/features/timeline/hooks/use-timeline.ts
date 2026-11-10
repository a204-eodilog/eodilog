import { useQueries, useQuery } from '@tanstack/react-query';

import { getAllMyTrips } from '@/features/my-trips';

import { getMyTimeline, getTripTimeline } from '../api';
import { sortTimeline } from '../timeline-rules';
import type { PlaceTimelineItem, TimelineItem, TimelineTrip } from '../types';

export const timelineKeys = {
  mine: ['me', 'timeline'] as const,
  trip: (tripId: string) => ['trips', tripId, 'timeline'] as const,
};

export type TimelineEntry = {
  item: TimelineItem;
  trip: TimelineTrip;
  places: PlaceTimelineItem[];
};

/**
 * S41에 필요한 것: 타임라인 순서(/me/timeline) + 여행 이름·기간(/me/trips) + 여행마다 장소 줄.
 * 셋 중 하나라도 못 받으면 화면 전체를 불러오기 실패로 둔다(값 문서에 부분 실패 모양이 없다)
 */
export function useTimeline() {
  const timeline = useQuery({ queryKey: timelineKeys.mine, queryFn: getMyTimeline });
  // N4 내 여행 목록과 같은 머리라 여행 이름을 바꾸면 함께 새로 받는다
  const trips = useQuery({ queryKey: ['me', 'trips'], queryFn: getAllMyTrips });
  const items = sortTimeline(timeline.data ?? []);
  const places = useQueries({
    queries: items.map((item) => ({
      queryKey: timelineKeys.trip(item.tripId),
      queryFn: () => getTripTimeline(item.tripId),
    })),
  });

  const byId = new Map((trips.data ?? []).map((t) => [t.id, t]));
  // 목록에서 이미 나간 여행(두 응답 사이에 바뀐 것)은 뺀다
  const entries: TimelineEntry[] = items.flatMap((item, i) => {
    const trip = byId.get(item.tripId);
    return trip ? [{ item, trip, places: places[i]?.data ?? [] }] : [];
  });

  const failed = timeline.isError || trips.isError || places.some((q) => q.isError);
  const loading = timeline.isPending || trips.isPending || places.some((q) => q.isPending);
  return {
    state: failed ? ('error' as const) : loading ? ('loading' as const) : ('ready' as const),
    entries,
    retry: () => {
      if (timeline.isError) void timeline.refetch();
      if (trips.isError) void trips.refetch();
      places.forEach((q) => {
        if (q.isError) void q.refetch();
      });
    },
  };
}
