import { useQuery } from '@tanstack/react-query';

import { expenseKeys, getAllExpenses, getSettlementState } from '@/features/expense';
import { getTripPhotos, photoKeys } from '@/features/photo';
import { getMyVisits, itineraryItemsQuery, visitKeys } from '@/features/visit';
import { useMe } from '@/hooks/use-me';

import { getRecordTrip } from '../api';

/**
 * S38에 필요한 것을 한꺼번에 읽는다: 여행(이름·기간·동행), 코스, 내 방문, 지출, 정산 상태, 나, 사진.
 * S33·S35와 같은 쿼리 키를 써서 그 화면에서 바꾼 내용이 돌아왔을 때 바로 맞는다
 */
export function useTripRecord(tripId: string) {
  const trip = useQuery({ queryKey: visitKeys.trip(tripId), queryFn: () => getRecordTrip(tripId) });
  const itinerary = useQuery(itineraryItemsQuery(tripId));
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
  // 사진 카드용. S31과 같은 키라 S30·S31에서 올리거나 지우면 돌아왔을 때 맞는다.
  // 사진을 못 읽어도 기록 화면은 그린다(카드는 머리 줄만)
  const photos = useQuery({
    queryKey: photoKeys.all(tripId),
    queryFn: () => getTripPhotos(tripId),
  });

  const queries = [trip, itinerary, visits, expenses, settlement, me];

  return {
    trip: trip.data,
    photos: photos.data,
    items: itinerary.data ?? [],
    visits: visits.data ?? [],
    expenses: expenses.data ?? [],
    settlement: settlement.data,
    myUserId: me.data?.id ?? null,
    isLoading: queries.some((q) => q.isPending),
    // 보이던 자료가 있으면 다시 받기가 한 번 실패해도 화면을 오류로 바꾸지 않는다(받은 적 없을 때만 오류)
    error: queries.find((q) => q.isError && q.data === undefined)?.error ?? null,
    refetch: () => Promise.all([...queries, photos].map((q) => q.refetch())),
  };
}
