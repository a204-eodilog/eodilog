import { useQuery } from '@tanstack/react-query';

import { getAllExpenses, getExpenseTrip, getMe, getSettlementState, getTripMembers } from '../api';

export const expenseKeys = {
  trip: (tripId: string) => ['trips', tripId] as const,
  members: (tripId: string) => ['trips', tripId, 'members'] as const,
  expenses: (tripId: string) => ['trips', tripId, 'expenses'] as const,
  settlement: (tripId: string) => ['trips', tripId, 'settlement'] as const,
};

/** 경비 화면에 필요한 것을 한꺼번에 읽는다: 여행 이름, 동행(나간 사람 포함), 지출 전부, 정산 상태, 나 */
export function useExpenseBoard(tripId: string) {
  const trip = useQuery({
    queryKey: expenseKeys.trip(tripId),
    queryFn: () => getExpenseTrip(tripId),
  });
  const members = useQuery({
    queryKey: expenseKeys.members(tripId),
    queryFn: () => getTripMembers(tripId),
  });
  const expenses = useQuery({
    queryKey: expenseKeys.expenses(tripId),
    queryFn: () => getAllExpenses(tripId),
  });
  const settlement = useQuery({
    queryKey: expenseKeys.settlement(tripId),
    queryFn: () => getSettlementState(tripId),
  });
  const me = useQuery({ queryKey: ['me'], queryFn: getMe });

  const queries = [trip, members, expenses, settlement, me];
  const myMemberId = members.data?.find((m) => m.user.id === me.data?.id)?.id ?? null;

  return {
    trip: trip.data,
    members: members.data ?? [],
    expenses: expenses.data ?? [],
    settlement: settlement.data,
    myMemberId,
    isLoading: queries.some((q) => q.isPending),
    error: queries.find((q) => q.isError)?.error ?? null,
    refetch: () => Promise.all(queries.map((q) => q.refetch())),
  };
}
