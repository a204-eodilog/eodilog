import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { API_ERROR, toApiError, type ApiError } from '@/api/errors';
import { createIdempotencyKeyStore } from '@/api/idempotency';
import { haptic } from '@/lib/haptics';

import { createTrip } from '../api';
import type { CreateTripBody, Trip } from '../types';
import { invalidateAfterJoin } from './trip-cache';
import { tripKey } from './use-trip';

const IN_PROGRESS_RETRY_MS = 1_000;

export type CreateTripProblem =
  | { kind: 'profileIncomplete' }
  /** 서버가 이름을 받지 않았다. 이름 칸 아래에 보인다 */
  | { kind: 'title'; message: string }
  | { kind: 'failed'; error: ApiError };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 새 여행 만들기. 버튼을 여러 번 눌러도, 응답을 못 받고 다시 보내도 여행은 하나만 생긴다.
 * - 요청 중에는 다시 보내지 않는다
 * - 같은 입력으로 다시 보낼 때는 같은 Idempotency-Key를 쓴다
 * - 서버가 "처리 중"(409 REQUEST_IN_PROGRESS)이면 잠깐 뒤 같은 키로 한 번 더 물어 결과를 받는다
 */
export function useCreateTrip({ onCreated }: { onCreated: (trip: Trip) => void }) {
  const queryClient = useQueryClient();
  const keys = useRef(createIdempotencyKeyStore()).current;
  // isPending은 다음 렌더에야 바뀌므로, 같은 순간의 연타는 이 값으로 막는다
  const sending = useRef(false);
  const [problem, setProblem] = useState<CreateTripProblem | null>(null);

  const mutation = useMutation({
    mutationFn: async (body: CreateTripBody) => {
      const key = keys.keyFor(body);
      try {
        return await createTrip(body, key);
      } catch (e) {
        if (toApiError(e).code !== API_ERROR.REQUEST_IN_PROGRESS) throw e;
        await wait(IN_PROGRESS_RETRY_MS);
        return createTrip(body, key);
      }
    },
    // 화면을 닫아도 여행은 만들어졌으므로 캐시는 여기서(화면과 관계없이) 맞춘다. 목록에 새 여행이 보인다
    onSuccess: (trip) => {
      keys.clear();
      setProblem(null);
      queryClient.setQueryData(tripKey(trip.id), trip);
      invalidateAfterJoin(queryClient);
      haptic.success();
    },
    onError: (e) => {
      const error = toApiError(e);
      if (error.code === API_ERROR.PROFILE_INCOMPLETE) setProblem({ kind: 'profileIncomplete' });
      else if (error.fields.title) setProblem({ kind: 'title', message: error.fields.title });
      else setProblem({ kind: 'failed', error });
    },
  });

  return {
    create: (body: CreateTripBody) => {
      if (sending.current) return;
      sending.current = true;
      setProblem(null);
      mutation.mutate(body, {
        // 만든 여행으로 이동은 이 화면이 열려 있을 때만 한다. mutate에 넘긴 콜백은 화면이 닫히면 불리지 않는다
        // (TanStack MutationObserver: hasListeners일 때만). 예전에는 만드는 중 X로 닫아도 잠시 뒤 새 여행 화면이
        // 갑자기 열렸다(2026-11-10 점검)
        onSuccess: (trip) => onCreated(trip),
        onSettled: () => {
          sending.current = false;
        },
      });
    },
    isPending: mutation.isPending,
    problem,
    clearProblem: () => setProblem(null),
  };
}
