import { useQuery } from '@tanstack/react-query';

import { getAllMyTrips, getMe } from '../api';

/** N4 내 여행 목록에 필요한 것: 여행 전부와 나(동행 이름에서 나를 뺀다) */
export function useMyTrips() {
  const trips = useQuery({ queryKey: ['me', 'trips'], queryFn: getAllMyTrips });
  const me = useQuery({ queryKey: ['me'], queryFn: getMe });
  return {
    trips: trips.data ?? [],
    myUserId: me.data?.id,
    isLoading: trips.isPending || me.isPending,
    error: trips.error ?? me.error,
    refetch: () => Promise.all([trips.refetch(), me.refetch()]),
  };
}
