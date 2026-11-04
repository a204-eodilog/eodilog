import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { calculateSettlement, getSettlementState, newIdempotencyKey } from '../api';
import type { SettlementState } from '../types';

import { expenseKeys } from './use-expense-board';

/**
 * 정산 계산. 보내기 직전에 지금 비용 버전을 다시 읽어 오래된 버전으로 409가 나지 않게 한다.
 * 같은 버전을 다시 보낼 때(응답을 놓친 재시도)는 같은 Idempotency-Key를, 버전이 바뀌면 새 키를 쓴다.
 * 서버는 같은 키에 다른 본문이 오면 409 IDEMPOTENCY_KEY_REUSED로 거부한다.
 */
export function useCalculateSettlement(tripId: string) {
  const queryClient = useQueryClient();
  const keyFor = useRef<{ version: number; key: string } | null>(null);

  return useMutation({
    mutationFn: async () => {
      const { currentExpenseVersion } = await getSettlementState(tripId);
      if (keyFor.current?.version !== currentExpenseVersion) {
        keyFor.current = { version: currentExpenseVersion, key: newIdempotencyKey() };
      }
      return calculateSettlement(tripId, currentExpenseVersion, keyFor.current.key);
    },
    onSuccess: (settlement) => {
      keyFor.current = null;
      const state: SettlementState = {
        current: settlement,
        currentExpenseVersion: settlement.expenseVersion,
        recalculationRequired: false,
      };
      queryClient.setQueryData(expenseKeys.settlement(tripId), state);
    },
  });
}
