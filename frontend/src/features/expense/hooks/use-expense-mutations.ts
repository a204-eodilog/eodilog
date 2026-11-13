import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { apiErrorCode } from '@/api/errors';

import { createExpense, deleteExpense, newIdempotencyKey, updateExpense } from '../api';
import { nextCreateAttempt, type CreateAttempt } from '../create-attempt';
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
 * 수정·삭제 실패 종류.
 * conflict: 그 사이 지출이 먼저 바뀌었다(409 VERSION_CONFLICT). 목록을 다시 읽어 새 version으로 다시 보낸다
 * gone: 이미 지워진 지출(404 EXPENSE_NOT_FOUND). 목록을 다시 읽으면 화면이 "지출을 찾을 수 없어요"로 바뀐다
 */
export type ExpenseFailure = 'conflict' | 'gone' | 'error';

export function expenseFailure(error: unknown): ExpenseFailure {
  const code = apiErrorCode(error);
  if (code === 'VERSION_CONFLICT') return 'conflict';
  if (code === 'EXPENSE_NOT_FOUND') return 'gone';
  return 'error';
}

/**
 * 수정·삭제가 옛 version 때문에 실패하면 목록을 다시 읽는다.
 * 그러지 않으면 [다시 저장]·[다시 시도]가 같은 옛 version을 보내 계속 409가 난다
 */
function useRefetchOnStale(tripId: string) {
  const queryClient = useQueryClient();
  return (error: unknown) => {
    if (expenseFailure(error) === 'error') return;
    return queryClient.invalidateQueries({ queryKey: expenseKeys.expenses(tripId) });
  };
}

/**
 * 지출 등록·수정. 등록은 같은 입력으로 [다시 저장]을 누르면 같은 Idempotency-Key와 지출 시각을 보내
 * 응답만 놓친 경우에도 두 번 등록되지 않는다. 입력을 고쳤거나 성공한 뒤에는 둘 다 새로 만든다.
 * 수정은 화면에 지금 있는 지출의 version을 보낸다(충돌 뒤 다시 읽으면 새 version이 들어온다).
 */
export function useSaveExpense(tripId: string, editing?: Expense) {
  const refresh = useRefreshExpenses(tripId);
  const refetchOnStale = useRefetchOnStale(tripId);
  const attempt = useRef<CreateAttempt | null>(null);
  return useMutation({
    mutationFn: (input: ExpenseInput) => {
      if (editing) return updateExpense(tripId, editing.id, input, editing.version);
      const next = nextCreateAttempt(attempt.current, input, () => ({
        key: newIdempotencyKey(),
        spentAt: new Date().toISOString(),
      }));
      attempt.current = next;
      return createExpense(tripId, input, next.key, next.spentAt);
    },
    onSuccess: async () => {
      attempt.current = null;
      await refresh();
    },
    onError: editing ? refetchOnStale : undefined,
  });
}

export function useDeleteExpense(tripId: string) {
  const refresh = useRefreshExpenses(tripId);
  const refetchOnStale = useRefetchOnStale(tripId);
  return useMutation({
    mutationFn: (expense: Expense) => deleteExpense(tripId, expense.id, expense.version),
    onSuccess: refresh,
    onError: refetchOnStale,
  });
}
