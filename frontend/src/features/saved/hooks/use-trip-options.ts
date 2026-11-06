import { useQuery } from '@tanstack/react-query';

import { useMe } from '@/hooks/use-me';
import { companionNames, formatPeriod, getAllMyTrips } from '@/features/my-trips';

import type { TripOption } from '../components/trip-pick-list';

export type TripsStatus = 'loading' | 'error' | 'ready';

/**
 * 담을 여행 고르기에 쓰는 내 여행 목록(S08 장소 저장 시트, S14 그룹에 추가 시트).
 * 시트를 열 때만 읽는다(N4와 같은 쿼리 키). 다녀온 여행도 담을 수 있어 전부 보여 준다(!137 리뷰)
 */
export function useTripOptions(enabled: boolean): {
  trips: TripOption[];
  status: TripsStatus;
  retry: () => void;
} {
  const query = useQuery({ queryKey: ['me', 'trips'], queryFn: getAllMyTrips, enabled });
  const me = useMe();
  const trips = (query.data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    period: formatPeriod(t.startDate, t.endDate),
    companions: companionNames(t, me.data?.id),
  }));
  // 실패 뒤 [다시 시도] 중에도 isError가 true로 남아 있어 다시 읽는 동안은 오류로 보지 않는다
  const status: TripsStatus =
    query.isError && !query.isFetching ? 'error' : query.data ? 'ready' : 'loading';
  return { trips, status, retry: () => void query.refetch() };
}
