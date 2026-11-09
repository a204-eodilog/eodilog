import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { toApiError } from '@/api/errors';
import { toast } from '@/components/ui';

import { deleteMySave, patchMyMemo, putMySave } from '../api';
import { MEMO_MAX } from '../group-rules';

import { savedPlacesRoot } from './group-keys';

/**
 * 그룹 즐겨찾기 담기·메모·빼기. 모두 내 저장만 바꾼다.
 * 끝나면 ['trips', tripId, 'saved-places'] 전체를 다시 받아 개인 즐겨찾기 화면의 그룹 담기와 맞춘다.
 * 같은 장소를 보내는 중이면 다시 보내지 않는다(두 번 누르기).
 */
export function useFavoriteMutations(tripId: string) {
  const queryClient = useQueryClient();
  const sending = useRef(new Set<string>());
  const [busy, setBusy] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: savedPlacesRoot(tripId) });

  async function run<T>(keys: string[], work: () => Promise<T>): Promise<T | null> {
    if (keys.some((k) => sending.current.has(k))) return null;
    keys.forEach((k) => sending.current.add(k));
    setBusy(true);
    try {
      return await work();
    } finally {
      keys.forEach((k) => sending.current.delete(k));
      setBusy(sending.current.size > 0);
    }
  }

  /** 장소들을 내 이름으로 담는다. 하나씩 차례로 보낸다. 담은 수를 돌려준다 */
  async function add(placeIds: string[]): Promise<number> {
    const done = await run(placeIds, async () => {
      let count = 0;
      for (const id of placeIds) {
        try {
          await putMySave(tripId, id);
          count += 1;
        } catch {
          // 하나가 실패해도 나머지는 담는다
        }
      }
      return count;
    });
    if (done === null) return 0;
    await refresh();
    if (done === placeIds.length) {
      toast.success(done > 1 ? `${done}곳을 그룹 즐겨찾기에 담았어요` : '그룹 즐겨찾기에 담았어요');
    } else {
      toast.error('담지 못한 장소가 있어요. 다시 시도해 주세요');
    }
    return done;
  }

  /** 내 메모 저장. 2000자까지. 끝났으면 true */
  async function saveMemo(placeId: string, memo: string): Promise<boolean> {
    const trimmed = memo.trim().slice(0, MEMO_MAX);
    const ok = await run([placeId], async () => {
      try {
        await patchMyMemo(tripId, placeId, trimmed);
        return true;
      } catch (e) {
        if (toApiError(e).status === 404) toast.show('내 저장이 없어요. 목록을 다시 불러왔어요');
        else toast.error('메모를 저장하지 못했어요');
        return false;
      }
    });
    await refresh();
    return ok === true;
  }

  /** 내 저장만 뺀다. 다른 동행이 담았으면 장소는 목록에 남는다 */
  async function remove(placeId: string): Promise<boolean> {
    const ok = await run([placeId], async () => {
      try {
        await deleteMySave(tripId, placeId);
        return true;
      } catch {
        toast.error('빼지 못했어요. 다시 시도해 주세요');
        return false;
      }
    });
    if (ok) {
      await refresh();
      toast.show('내 저장을 뺐어요');
    }
    return ok === true;
  }

  return { add, saveMemo, remove, busy };
}
