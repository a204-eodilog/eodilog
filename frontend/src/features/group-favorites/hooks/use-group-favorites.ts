import { useInfiniteQuery } from '@tanstack/react-query';

import { toApiError } from '@/api/errors';

import { getSavedPlaces } from '../api';
import type { ListQuery } from '../types';

import { savedListKey } from './group-keys';

/**
 * 그룹 즐겨찾기 목록. 최근 담은 순으로 20개씩 이어 받는다.
 * 실시간 갱신이 없으므로 화면을 열 때마다 다시 받는다. 404·400은 재시도하지 않는다.
 */
export function useGroupFavorites(tripId: string, query: ListQuery) {
  const result = useInfiniteQuery({
    queryKey: savedListKey(tripId, query),
    queryFn: ({ pageParam, signal }) => getSavedPlaces(tripId, query, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.page.hasNext ? last.page.nextCursor : null),
    refetchOnMount: 'always',
    retry: (count, e) => {
      const { status } = toApiError(e);
      return status !== 404 && status !== 400 && count < 1;
    },
  });
  const pages = result.data?.pages ?? [];
  return {
    ...result,
    items: pages.flatMap((p) => p.items),
    /** 첫 쪽의 전체·겹친 곳 수. 칩에 보인다 */
    totals: pages[0]?.totals ?? null,
  };
}
