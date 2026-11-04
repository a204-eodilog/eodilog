import { useQueries, type QueryClient } from '@tanstack/react-query';

import { getRegion } from '../api';
import { shortRegionName } from '../trip-rules';
import type { Region } from '../types';

const regionKey = (id: string) => ['regions', id] as const;

/** 고른 지역을 캐시에 미리 넣어 상세 첫 화면에서 다시 부르지 않는다 */
export function primeRegion(queryClient: QueryClient, region: Region) {
  queryClient.setQueryData(regionKey(region.id), region);
}

/** 여행의 지역 id들 → 짧은 이름. 지역 이름은 바뀌지 않아 한 번 받으면 다시 부르지 않는다 */
export function useRegionNames(ids: string[]): string[] {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: regionKey(id),
      queryFn: () => getRegion(id),
      staleTime: Infinity,
      gcTime: Infinity,
    })),
  });
  return results.flatMap((r) => (r.data ? [shortRegionName(r.data.name)] : []));
}
