import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { API_ERROR, toApiError } from '@/api/errors';
import { toast } from '@/components/ui';

import { addChecklistItem, deleteChecklistItem, updateChecklistItem } from '../api';
import { CHECKLIST_TEXT, validateLabel } from '../checklist-rules';
import type { ChecklistItem } from '../types';

import { checklistKey } from './checklist-keys';
import { appendCachedItem, putCachedItem, removeCachedItem } from './use-checklist';

/**
 * 준비물 직접 추가, 이름 고치기, 지우기.
 * 추가는 한 번 누른 것이 끝나기 전에는 다시 보내지 않는다(서버 추가 API에는 중복 방지 키가 없다).
 * 고치기·지우기에서 409 VERSION_CONFLICT면 덮어쓰지 않고 목록을 다시 받고, 404면 목록에서 뺀다.
 */
export function useItemMutations(tripId: string) {
  const queryClient = useQueryClient();
  const adding = useRef(false);
  const [isAdding, setIsAdding] = useState(false);

  const refetch = () => void queryClient.invalidateQueries({ queryKey: checklistKey(tripId) });

  /** 서버 오류를 안내하고 캐시를 맞춘다. 처리했으면 true */
  function handleWriteError(item: ChecklistItem, error: unknown) {
    const { code } = toApiError(error);
    if (code === API_ERROR.VERSION_CONFLICT) {
      toast.show(CHECKLIST_TEXT.conflict);
      refetch();
      return;
    }
    if (code === API_ERROR.CHECKLIST_ITEM_NOT_FOUND) {
      removeCachedItem(queryClient, tripId, item.id);
      toast.show(CHECKLIST_TEXT.gone);
      return;
    }
    toast.error(CHECKLIST_TEXT.saveFailed);
  }

  /** 직접 추가. 이름이 규칙에 맞지 않거나 이미 보내는 중이면 보내지 않는다. 더했으면 true */
  async function add(raw: string): Promise<boolean> {
    const label = validateLabel(raw);
    if (!label || adding.current) return false;
    adding.current = true;
    setIsAdding(true);
    try {
      const created = await addChecklistItem(tripId, label);
      appendCachedItem(queryClient, tripId, created);
      return true;
    } catch {
      toast.error(CHECKLIST_TEXT.addFailed);
      return false;
    } finally {
      adding.current = false;
      setIsAdding(false);
    }
  }

  /** 이름 고치기. 이름이 그대로면 보내지 않는다. 끝났으면(실패 안내 포함) true, 규칙에 맞지 않으면 false */
  async function rename(item: ChecklistItem, raw: string): Promise<boolean> {
    const label = validateLabel(raw);
    if (!label) return false;
    if (label === item.label) return true;
    try {
      const saved = await updateChecklistItem(tripId, item.id, {
        expectedVersion: item.version,
        label,
      });
      putCachedItem(queryClient, tripId, saved);
    } catch (e) {
      handleWriteError(item, e);
    }
    return true;
  }

  /** 지우기. 목록에서 먼저 빼고, 실패하면 목록을 다시 받는다. 이미 지워졌으면 그대로 둔다 */
  async function remove(item: ChecklistItem): Promise<void> {
    removeCachedItem(queryClient, tripId, item.id);
    try {
      await deleteChecklistItem(tripId, item.id);
    } catch (e) {
      if (toApiError(e).code === API_ERROR.CHECKLIST_ITEM_NOT_FOUND) return;
      toast.error(CHECKLIST_TEXT.saveFailed);
      refetch();
    }
  }

  return { add, rename, remove, isAdding };
}
