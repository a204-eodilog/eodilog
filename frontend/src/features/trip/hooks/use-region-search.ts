import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { searchRegions } from '../api';

const DEBOUNCE_MS = 300;

/** 입력이 멈춘 뒤에만 값을 바꾼다. 글자마다 검색하지 않게 */
export function useDebouncedValue<T>(value: T, delayMs = DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** 여행지 검색. 서버는 이름 부분 일치이고 한 글자 이상이어야 한다 */
export function useRegionSearch(input: string) {
  const query = useDebouncedValue(input.trim());
  const result = useInfiniteQuery({
    queryKey: ['regions', 'search', query],
    queryFn: ({ pageParam }) => searchRegions(query, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.page.hasNext ? last.page.nextCursor : undefined),
    enabled: query.length > 0,
    staleTime: 5 * 60_000,
  });
  const regions = result.data?.pages.flatMap((p) => p.data) ?? [];
  return { ...result, query, regions };
}
