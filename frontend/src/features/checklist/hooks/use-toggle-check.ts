import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { API_ERROR, toApiError } from '@/api/errors';
import { toast } from '@/components/ui';

import { updateChecklistItem } from '../api';
import { createCheckQueue } from '../check-queue';
import { CHECKLIST_TEXT } from '../checklist-rules';
import type { ChecklistItem } from '../types';

import { checklistKey } from './checklist-keys';
import { putCachedItem, removeCachedItem } from './use-checklist';

/** 화면에 먼저 그릴 모습. 챙긴 사람은 서버가 기록하지만 나라는 것을 알고 있어 바로 보인다 */
function shown(item: ChecklistItem, checked: boolean, myMemberId: string | null): ChecklistItem {
  return {
    ...item,
    checked,
    checkedByMemberId: checked ? myMemberId : null,
    checkedAt: checked ? new Date().toISOString() : null,
  };
}

/**
 * 준비물 체크·해제. 누르는 즉시 캐시를 바꾸고 check-queue로 항목마다 요청을 하나씩 보낸다.
 * 409 VERSION_CONFLICT: 다른 동행의 변경을 덮어쓰지 않고 목록을 다시 받는다.
 * 404 CHECKLIST_ITEM_NOT_FOUND: 다른 동행이 지웠으므로 목록에서 뺀다.
 * 그 밖의 실패: 마지막으로 저장된 상태로 되돌린다.
 */
export function useToggleCheck(tripId: string, myMemberId: string | null) {
  const queryClient = useQueryClient();
  const [queue] = useState(() =>
    createCheckQueue({
      send: (item, checked) =>
        updateChecklistItem(tripId, item.id, { expectedVersion: item.version, checked }),
      onSaved: (saved, wanted) => {
        // 이어 보낼 상태가 있으면 화면은 그 모습 그대로 두고 version과 이름만 받아 둔다
        const cached = queryClient
          .getQueryData<ChecklistItem[]>(checklistKey(tripId))
          ?.find((i) => i.id === saved.id);
        putCachedItem(
          queryClient,
          tripId,
          wanted === null || !cached
            ? saved
            : {
                ...saved,
                checked: cached.checked,
                checkedByMemberId: cached.checkedByMemberId,
                checkedAt: cached.checkedAt,
              },
        );
      },
      onError: (server, error) => {
        const { code } = toApiError(error);
        if (code === API_ERROR.VERSION_CONFLICT) {
          toast.show(CHECKLIST_TEXT.conflict);
          void queryClient.invalidateQueries({ queryKey: checklistKey(tripId) });
          return;
        }
        if (code === API_ERROR.CHECKLIST_ITEM_NOT_FOUND) {
          removeCachedItem(queryClient, tripId, server.id);
          toast.show(CHECKLIST_TEXT.gone);
          return;
        }
        putCachedItem(queryClient, tripId, server);
        toast.error(CHECKLIST_TEXT.saveFailed);
      },
    }),
  );

  return (item: ChecklistItem) => {
    const next = !item.checked;
    // 받는 중인 목록이 낙관적 모습을 덮지 않게 멈춘다
    void queryClient.cancelQueries({ queryKey: checklistKey(tripId) });
    queue.toggle(item, next);
    putCachedItem(queryClient, tripId, shown(item, next, myMemberId));
  };
}
