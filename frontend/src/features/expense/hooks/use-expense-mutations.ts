import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { createExpense, deleteExpense, newIdempotencyKey, updateExpense } from '../api';
import type { Expense, ExpenseInput } from '../types';

import { expenseKeys } from './use-expense-board';

/** 지출이 바뀌면 목록·정산 상태·여행(비용 버전)을 다시 읽는다 */
function useRefreshExpenses(tripId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: expenseKeys.expenses(tripId) }),
      queryClient.invalidateQueries({ queryKey: expenseKeys.settlement(tripId) }),
      queryClient.invalidateQueries({ queryKey: expenseKeys.trip(tripId), exact: true }),
    ]);
}

/**
 * 지출 등록·수정. 등록은 [다시 저장]을 눌러도 같은 Idempotency-Key를 보내
 * 응답만 놓친 경우에도 두 번 등록되지 않는다. 성공하면 키를 새로 만든다.
 */
export function useSaveExpense(tripId: string, editing?: Expense) {
  const refresh = useRefreshExpenses(tripId);
  const key = useRef(newIdempotencyKey());
  return useMutation({
    mutationFn: (input: ExpenseInput) =>
      editing
        ? updateExpense(tripId, editing.id, input, editing.version)
        : createExpense(tripId, input, key.current),
    onSuccess: async () => {
      key.current = newIdempotencyKey();
      await refresh();
    },
  });
}

export function useDeleteExpense(tripId: string) {
  const refresh = useRefreshExpenses(tripId);
  return useMutation({
    mutationFn: (expense: Expense) => deleteExpense(tripId, expense.id, expense.version),
    onSuccess: refresh,
  });
}
