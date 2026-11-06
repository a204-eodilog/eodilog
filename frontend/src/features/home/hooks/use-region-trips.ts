import { useQueries } from '@tanstack/react-query';

import { getRegionFeeds } from '../api';
import { toRegionTripCards } from '../home-rules';
import type { RegionMark, RegionTrips } from '../types';

/** S06 실제 값. 누른 지역마다 GET /home/regions/{regionId}/feeds. 지역 ID를 모르면 빈 목록 */
export function useRegionTrips(marks: readonly RegionMark[]) {
  const results = useQueries({
    queries: marks.map((m) => ({
      queryKey: ['home', 'region-feeds', m.regionId ?? m.regionCode],
      queryFn: async () => toRegionTripCards(await getRegionFeeds(m.regionId ?? '')),
      enabled: !!m.regionId,
      retry: false,
    })),
  });
  const groups: RegionTrips[] = marks.map((mark, i) => {
    const q = results[i];
    return {
      mark,
      state: !mark.regionId ? 'ready' : q?.isError ? 'error' : q?.data ? 'ready' : 'loading',
      cards: q?.data ?? [],
    };
  });
  return { groups, retry: () => results.forEach((q) => void q.refetch()) };
}
