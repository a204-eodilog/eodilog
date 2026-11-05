import { useQueries, type QueryClient } from '@tanstack/react-query';

import { getRegion } from '../api';
import { shortRegionName } from '../trip-rules';
import type { Region } from '../types';

const regionKey = (id: string) => ['regions', id] as const;

/** 지역들을 캐시에서 꺼내거나 받아 온다(고른 순서). 받지 못한 지역은 뺀다. 409 뒤 S19 입력을 다시 채울 때 쓴다 */
export async function ensureRegions(queryClient: QueryClient, ids: string[]): Promise<Region[]> {
  const results = await Promise.allSettled(
    ids.map((id) =>
      queryClient.ensureQueryData({ queryKey: regionKey(id), queryFn: () => getRegion(id) }),
    ),
  );
  return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
}

/** 고른 지역을 캐시에 미리 넣어 상세 첫 화면에서 다시 부르지 않는다 */
export function primeRegion(queryClient: QueryClient, region: Region) {
  queryClient.setQueryData(regionKey(region.id), region);
}

/**
 * 여행의 지역 id들 → 지역 정보(고른 순서). 지역 이름은 바뀌지 않아 한 번 받으면 다시 부르지 않는다.
 * ready는 모두 받았을 때 true. S19는 다 받은 뒤에 입력 칸을 채운다
 */
export function useRegions(ids: string[]): { regions: Region[]; ready: boolean } {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: regionKey(id),
      queryFn: () => getRegion(id),
      staleTime: Infinity,
      gcTime: Infinity,
    })),
  });
  const regions = results.flatMap((r) => (r.data ? [r.data] : []));
  // 받지 못한 지역이 있어도(삭제된 지역 등) 실패가 끝났으면 기다리지 않는다
  const ready = results.every((r) => !r.isPending);
  return { regions, ready };
}

/** 여행의 지역 id들 → 짧은 이름 */
export function useRegionNames(ids: string[]): string[] {
  return useRegions(ids).regions.map((r) => shortRegionName(r.name));
}
