import { useQueries, type QueryClient } from '@tanstack/react-query';

import { toApiError } from '@/api/errors';
import { isWaitingOffline } from '@/api/query-focus';

import { getRegion } from '../api';
import { shortRegionName } from '../trip-rules';
import type { Region } from '../types';

const regionKey = (id: string) => ['regions', id] as const;

/**
 * 지역을 못 받은 까닭이 잠깐의 문제(서버 오류·시간 초과 등)인가. 없어진 지역(404)만 아니면 그렇다.
 * S19는 받은 지역으로 입력 칸을 채우고 [완료]가 여행지 전체를 보낸다. 잠깐 못 받은 지역을 빼고 채우면
 * 아무것도 안 고쳐도 그 여행지가 여행에서 지워진다(2026-11-10 점검). 그래서 이때는 채우지 않고 다시 받게 한다
 */
export function isRegionLoadFailure(error: unknown): boolean {
  return toApiError(error).status !== 404;
}

/**
 * 지역들을 캐시에서 꺼내거나 받아 온다(고른 순서). 없어진 지역은 뺀다. 409 뒤 S19 입력을 다시 채울 때 쓴다.
 * 잠깐의 문제로 못 받은 지역이 있으면 던진다(빼고 채우면 저장할 때 그 여행지가 지워진다)
 */
export async function ensureRegions(queryClient: QueryClient, ids: string[]): Promise<Region[]> {
  const results = await Promise.allSettled(
    ids.map((id) =>
      queryClient.ensureQueryData({ queryKey: regionKey(id), queryFn: () => getRegion(id) }),
    ),
  );
  const failed = results.find((r) => r.status === 'rejected' && isRegionLoadFailure(r.reason));
  if (failed?.status === 'rejected') throw failed.reason;
  return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
}

/** 고른 지역을 캐시에 미리 넣어 상세 첫 화면에서 다시 부르지 않는다 */
export function primeRegion(queryClient: QueryClient, region: Region) {
  queryClient.setQueryData(regionKey(region.id), region);
}

/**
 * 여행의 지역 id들 → 지역 정보(고른 순서). 지역 이름은 바뀌지 않아 한 번 받으면 다시 부르지 않는다.
 * ready는 모두 받았을 때 true. S19는 다 받은 뒤에 입력 칸을 채운다.
 * waitingOffline은 받지 못한 지역이 연결이 끊겨 멈췄는가. 이때 ready는 연결될 때까지 false다.
 * failed는 잠깐의 문제로 못 받은 지역이 있는가. 이때도 ready는 false이고 retry로 그 지역만 다시 받는다
 */
export function useRegions(ids: string[]): {
  regions: Region[];
  ready: boolean;
  waitingOffline: boolean;
  failed: boolean;
  retry: () => void;
} {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: regionKey(id),
      queryFn: () => getRegion(id),
      staleTime: Infinity,
      gcTime: Infinity,
    })),
  });
  const regions = results.flatMap((r) => (r.data ? [r.data] : []));
  const failedResults = results.filter((r) => r.isError && isRegionLoadFailure(r.error));
  const failed = failedResults.length > 0;
  // 없어진 지역(404)은 기다리지 않고 뺀다. 잠깐 못 받은 지역이 있으면 준비되지 않은 것으로 본다
  const ready = !failed && results.every((r) => !r.isPending);
  const waitingOffline = results.some(isWaitingOffline);
  const retry = () => {
    for (const r of failedResults) void r.refetch();
  };
  return { regions, ready, waitingOffline, failed, retry };
}

/** 여행의 지역 id들 → 짧은 이름 */
export function useRegionNames(ids: string[]): string[] {
  return useRegions(ids).regions.map((r) => shortRegionName(r.name));
}
