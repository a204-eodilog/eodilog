import { useQuery } from '@tanstack/react-query';

import { expenseKeys, getAllExpenses, getSettlementState } from '@/features/expense';
import { getItineraryItems, getMyVisits, visitKeys } from '@/features/visit';
import { useMe } from '@/hooks/use-me';

import { getRecordTrip } from '../api';

/**
 * S38에 필요한 것을 한꺼번에 읽는다: 여행(이름·기간·동행), 코스, 내 방문, 지출, 정산 상태, 나.
 * S33·S35와 같은 쿼리 키를 써서 그 화면에서 바꾼 내용이 돌아왔을 때 바로 맞는다
 */
export function useTripRecord(tripId: string) {
  const trip = useQuery({ queryKey: visitKeys.trip(tripId), queryFn: () => getRecordTrip(tripId) });
  const itinerary = useQuery({
    queryKey: visitKeys.itinerary(tripId),
    queryFn: () => getItineraryItems(tripId),
  });
  const visits = useQuery({
    queryKey: visitKeys.myVisits(tripId),
    queryFn: () => getMyVisits(tripId),
  });
  const expenses = useQuery({
    queryKey: expenseKeys.expenses(tripId),
    queryFn: () => getAllExpenses(tripId),
  });
  const settlement = useQuery({
    queryKey: expenseKeys.settlement(tripId),
    queryFn: () => getSettlementState(tripId),
  });
  const me = useMe();

  const queries = [trip, itinerary, visits, expenses, settlement, me];

  return {
    trip: trip.data,
    items: itinerary.data ?? [],
    visits: visits.data ?? [],
    expenses: expenses.data ?? [],
    settlement: settlement.data,
    myUserId: me.data?.id ?? null,
    isLoading: queries.some((q) => q.isPending),
    error: queries.find((q) => q.isError)?.error ?? null,
    refetch: () => Promise.all(queries.map((q) => q.refetch())),
  };
}
