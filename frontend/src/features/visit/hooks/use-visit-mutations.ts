import { useMutation, useQueryClient } from '@tanstack/react-query';

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

/**
 * 토스트 [되돌리기]. 지우기 전에 목록에서 먼저 빼서 줄이 바로 '계획에만 있어요'로 돌아간다.
 * 이미 해제된 방문(404 VISIT_NOT_FOUND)은 되돌린 것과 같으니 실패로 보지 않는다.
 * 그 밖의 실패는 목록을 다시 읽어 서버 상태로 돌려놓는다
 */
export function useUndoVisit(tripId: string) {
  const queryClient = useQueryClient();
  const key = visitKeys.myVisits(tripId);
  return useMutation({
    mutationFn: async (visit: Visit) => {
      queryClient.setQueryData<Visit[]>(key, (old = []) => old.filter((v) => v.id !== visit.id));
      try {
        await deleteVisit(tripId, visit.id);
      } catch (e) {
        if (apiErrorCode(e) !== 'VISIT_NOT_FOUND') throw e;
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
