import { useQueries } from '@tanstack/react-query';

import { useRegions } from '@/features/trip/hooks/use-region-names';
import { shortRegionName } from '@/features/trip/trip-rules';

import { getPlace } from '../api';
import { UNKNOWN_NAME } from '../candidate-options';
import type { PollCandidate } from '../types';
import { placeKey } from './poll-keys';

/** 지역 ID들 → 짧은 지역 이름 맵. 받지 못한 지역은 빠진다 */
export function useRegionNameMap(regionIds: string[]): Record<string, string> {
  const { regions } = useRegions(regionIds);
  return Object.fromEntries(regions.map((r) => [r.id, shortRegionName(r.name)]));
}

/**
 * 후보 ID → 이름(research R1). 지역은 기존 지역 캐시, 장소는 GET /places/{id}.
 * 이름은 바뀌지 않아 한 번 받으면 다시 부르지 않는다. 받지 못한 후보는 "알 수 없는 곳"이다
 */
export function useCandidateNames(candidates: PollCandidate[]): {
  names: Record<string, string>;
  ready: boolean;
} {
  const regionIds = candidates.flatMap((c) => (c.regionId ? [c.regionId] : []));
  const placeIds = candidates.flatMap((c) => (c.placeId ? [c.placeId] : []));
  const regions = useRegions(regionIds);
  const places = useQueries({
    queries: placeIds.map((id) => ({
      queryKey: placeKey(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => getPlace(id, signal),
      staleTime: Infinity,
      gcTime: Infinity,
    })),
  });

  const regionName = new Map(regions.regions.map((r) => [r.id, shortRegionName(r.name)]));
  const placeName = new Map(
    places.flatMap((q) => (q.data ? [[q.data.id, q.data.name] as const] : [])),
  );
  const names: Record<string, string> = {};
  for (const c of candidates) {
    const name = c.regionId
      ? regionName.get(c.regionId)
      : c.placeId
        ? placeName.get(c.placeId)
        : null;
    names[c.id] = name ?? UNKNOWN_NAME;
  }
  const ready = regions.ready && places.every((q) => !q.isPending);
  return { names, ready };
}
