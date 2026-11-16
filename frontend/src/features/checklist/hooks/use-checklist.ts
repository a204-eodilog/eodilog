import { useQuery, type QueryClient } from '@tanstack/react-query';

import { toApiError } from '@/api/errors';

import { getChecklist } from '../api';
import type { ChecklistItem } from '../types';

import { checklistKey } from './checklist-keys';

/**
 * 여행의 준비물 목록. 실시간 갱신이 없으므로 화면을 열 때마다 다시 받는다.
 * 없거나 볼 수 없는 여행(404)과 잘못된 주소(400)는 다시 시도해도 같아 재시도하지 않는다.
 * 다시 받다 실패해도 보이던 목록은 그대로 둔다(react-query가 이전 data를 유지한다).
 */
export function useChecklist(tripId: string) {
  return useQuery({
    queryKey: checklistKey(tripId),
    queryFn: ({ signal }) => getChecklist(tripId, signal),
    refetchOnMount: 'always',
    retry: (count, e) => {
      const { status } = toApiError(e);
      return status !== 404 && status !== 400 && count < 1;
    },
  });
}

/**
 * 여행 중(S25) 도구 줄의 "N/M 챙김" 요약을 다시 받게 한다. 목록 캐시만 고치면 요약은 따로 받은 값이라
 * 그대로 남는다(여행 중 화면은 스택 아래에 살아 있어 돌아와도 다시 받지 않는다).
 * 목록 키 전체를 무효화하면 낙관적으로 바꾼 목록을 서버 값이 덮으므로 요약 키만 무효화한다
 */
function refreshSummary(queryClient: QueryClient, tripId: string) {
  void queryClient.invalidateQueries({
    queryKey: [...checklistKey(tripId), 'summary'],
    exact: true,
  });
}

/** 캐시의 항목 하나를 바꾼다. 목록이 아직 없으면 그대로 둔다 */
export function putCachedItem(queryClient: QueryClient, tripId: string, item: ChecklistItem) {
  queryClient.setQueryData<ChecklistItem[]>(checklistKey(tripId), (list) =>
    list?.map((i) => (i.id === item.id ? item : i)),
  );
  refreshSummary(queryClient, tripId);
}

/** 캐시에서 항목 하나를 뺀다(다른 동행이 지웠거나 내가 지움) */
export function removeCachedItem(queryClient: QueryClient, tripId: string, itemId: string) {
  queryClient.setQueryData<ChecklistItem[]>(checklistKey(tripId), (list) =>
    list?.filter((i) => i.id !== itemId),
  );
  refreshSummary(queryClient, tripId);
}

/** 캐시 목록 끝에 항목을 더한다. 이미 있으면 바꾼다 */
export function appendCachedItem(queryClient: QueryClient, tripId: string, item: ChecklistItem) {
  queryClient.setQueryData<ChecklistItem[]>(checklistKey(tripId), (list) => {
    if (!list) return [item];
    return list.some((i) => i.id === item.id)
      ? list.map((i) => (i.id === item.id ? item : i))
      : [...list, item];
  });
  refreshSummary(queryClient, tripId);
}
