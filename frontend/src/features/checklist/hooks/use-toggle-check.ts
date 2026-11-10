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
  const [{ queue, refresh }] = useState(() => {
    const refresh = {
      /** 충돌 뒤 최신 목록을 다시 받는 중. 이때는 다음 체크가 그 받기를 멈추지 않게 한다 */
      running: false,
      /** 다시 받는 동안 저장이 끝난 항목. 받은 목록이 이보다 옛것이면 다시 덮는다 */
      saved: new Map<string, ChecklistItem>(),
    };
    const queue = createCheckQueue({
      send: (item, checked) =>
        updateChecklistItem(tripId, item.id, { expectedVersion: item.version, checked }),
      onSaved: (saved, wanted) => {
        // 이어 보낼 상태가 있으면 화면은 그 모습 그대로 두고 version과 이름만 받아 둔다
        const cached = queryClient
          .getQueryData<ChecklistItem[]>(checklistKey(tripId))
          ?.find((i) => i.id === saved.id);
        const next =
          wanted === null || !cached
            ? saved
            : {
                ...saved,
                checked: cached.checked,
                checkedByMemberId: cached.checkedByMemberId,
                checkedAt: cached.checkedAt,
              };
        putCachedItem(queryClient, tripId, next);
        if (refresh.running) refresh.saved.set(next.id, next);
      },
      onError: (server, error) => {
        const { code } = toApiError(error);
        if (code === API_ERROR.VERSION_CONFLICT) {
          toast.show(CHECKLIST_TEXT.conflict);
          // 다시 받기 전까지 내가 누른 모습이 아니라 마지막으로 저장된 모습을 보인다
          putCachedItem(queryClient, tripId, server);
          refresh.running = true;
          void queryClient.invalidateQueries({ queryKey: checklistKey(tripId) }).finally(() => {
            refresh.running = false;
            // 받은 목록이 그 사이 저장한 항목보다 옛것이면 저장한 모습으로 다시 덮는다
            const list = queryClient.getQueryData<ChecklistItem[]>(checklistKey(tripId)) ?? [];
            refresh.saved.forEach((saved) => {
              const now = list.find((i) => i.id === saved.id);
              if (now && now.version < saved.version) putCachedItem(queryClient, tripId, saved);
            });
            refresh.saved.clear();
          });
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
    });
    return { queue, refresh };
  });

  return (item: ChecklistItem) => {
    const next = !item.checked;
    // 받는 중인 목록이 낙관적 모습을 덮지 않게 멈춘다. 충돌 뒤 다시 받기는 멈추지 않는다.
    // 그 받기가 이 항목의 예전 모습을 잠깐 그려도 저장이 끝나면 서버 값으로 맞춰진다
    if (!refresh.running) void queryClient.cancelQueries({ queryKey: checklistKey(tripId) });
    queue.toggle(item, next);
    putCachedItem(queryClient, tripId, shown(item, next, myMemberId));
  };
}
