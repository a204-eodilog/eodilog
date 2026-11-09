import { useQueries, useQuery } from '@tanstack/react-query';

import { tripKey } from '@/features/trip/hooks/use-trip';

import { getChecklistSummary, getWeather } from '../api';

export const weatherKey = (tripId: string, date: string, placeId: string) =>
  [...tripKey(tripId), 'weather', date, placeId] as const;

/**
 * 그 날 그 장소의 날씨. 날짜나 장소가 없으면 묻지 않는다.
 * 새로고침이 실패해도 마지막 값은 남아 화면이 '날씨 갱신 실패'와 마지막 기준을 함께 보인다.
 */
export function useWeather(tripId: string, date: string | null, placeId: string | null) {
  return useQuery({
    queryKey: weatherKey(tripId, date ?? '', placeId ?? ''),
    queryFn: ({ signal }) => getWeather(tripId, date as string, placeId as string, signal),
    enabled: Boolean(date && placeId),
    retry: false,
  });
}

/** 여행 시작 전 날짜별 예보. 장소가 있는 날만 묻는다(Q-10-4) */
export function useForecasts(tripId: string, days: readonly { date: string; placeId: string }[]) {
  return useQueries({
    queries: days.map((d) => ({
      queryKey: weatherKey(tripId, d.date, d.placeId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getWeather(tripId, d.date, d.placeId, signal),
      retry: false,
    })),
  });
}

/** 준비물 전체와 챙긴 수. 받지 못하면 data가 없다(Q-10-5) */
export function useChecklistSummary(tripId: string) {
  return useQuery({
    queryKey: [...tripKey(tripId), 'checklist', 'summary'],
    queryFn: ({ signal }) => getChecklistSummary(tripId, signal),
    retry: false,
  });
}
