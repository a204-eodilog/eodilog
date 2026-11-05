import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';

import { apiErrorCode } from '@/api/errors';

import { createManualVisit, deleteVisit } from '../api';
import type { Visit } from '../types';

import { visitKeys } from './use-visit-board';

/**
 * '다녀옴' 직접 체크. 응답으로 받은 방문을 바로 목록에 넣어 줄이 '직접 체크함'으로 바뀌게 하고,
 * 서버 목록도 다시 읽는다. 같은 장소를 다시 보내도 서버가 기존 방문을 돌려줘 두 번 생기지 않는다
 */
export function useCheckVisit(tripId: string) {
  const queryClient = useQueryClient();
  const key = visitKeys.myVisits(tripId);
  return useMutation({
    mutationFn: ({ placeId, visitedAt }: { placeId: string; visitedAt: string }) =>
      createManualVisit(tripId, placeId, visitedAt),
    onSuccess: async (visit) => {
      queryClient.setQueryData<Visit[]>(key, (old = []) => [
        visit,
        ...old.filter((v) => v.id !== visit.id),
      ]);
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/** 되돌리는 중인 방문을 화면이 찾을 때 쓰는 키(useMutationState) */
export const undoVisitKey = (tripId: string) => ['trips', tripId, 'visits', 'undo'] as const;

/**
 * 토스트 [되돌리기]의 처리. 지우기 전에 목록에서 먼저 빼서 줄이 바로 '계획에만 있어요'로 돌아간다.
 * 그 사이 끝난 다시 읽기가 뺀 방문을 되살리지 않게 진행 중인 조회는 먼저 취소한다.
 * 이미 해제된 방문(404 VISIT_NOT_FOUND)은 되돌린 것과 같으니 실패로 보지 않는다.
 * 그 밖의 실패는 뺀 방문을 다시 넣고 다시 읽는다. 다시 읽기마저 실패해도 서버에 남은 방문이 화면에 보인다
 */
export function undoVisitOptions(queryClient: QueryClient, tripId: string) {
  const key = visitKeys.myVisits(tripId);
  return {
    mutationKey: undoVisitKey(tripId),
    mutationFn: async (visit: Visit) => {
      try {
        await deleteVisit(tripId, visit.id);
      } catch (e) {
        if (apiErrorCode(e) !== 'VISIT_NOT_FOUND') throw e;
      }
    },
    onMutate: async (visit: Visit) => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<Visit[]>(key, (old = []) => old.filter((v) => v.id !== visit.id));
    },
    onError: (_error: unknown, visit: Visit) => {
      queryClient.setQueryData<Visit[]>(key, (old = []) =>
        old.some((v) => v.id === visit.id) ? old : [visit, ...old],
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  };
}

export function useUndoVisit(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation(undoVisitOptions(queryClient, tripId));
}
