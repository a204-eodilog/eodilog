import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { toApiError } from '@/api/errors';
import { toast } from '@/components/ui';
import { useTrip } from '@/features/trip/hooks/use-trip';
import { useMe } from '@/hooks/use-me';

import { deleteMySave, getSavedPlaces, patchMyMemo, putMySave } from '../api';
import { MEMO_MAX } from '../group-rules';

import { savedPlacesRoot } from './group-keys';

/**
 * 그룹 즐겨찾기 담기·메모·빼기. 모두 내 저장만 바꾼다.
 * 끝나면 ['trips', tripId, 'saved-places'] 전체를 다시 받아 개인 즐겨찾기 화면의 그룹 담기와 맞춘다.
 * 같은 장소를 보내는 중이면 다시 보내지 않는다(두 번 누르기).
 *
 * 담기 PUT은 본문에 메모가 없으면 서버가 내 메모를 비운다. 그래서 담기 전에 내가 이미 담은 장소를 서버에서 받아
 * 그 장소는 다시 보내지 않는다. 필터가 걸렸거나 첫 쪽만 받은 화면 목록으로는 내가 담았는지 알 수 없다.
 */
export function useFavoriteMutations(tripId: string) {
  const queryClient = useQueryClient();
  const sending = useRef(new Set<string>());
  const [busy, setBusy] = useState(false);
  const trip = useTrip(tripId);
  const me = useMe();
  const myMemberId =
    trip.data?.members.find((m) => m.status === 'ACTIVE' && m.user.id === me.data?.id)?.id ?? null;

  /** 내가 이 여행에 담은 장소 전부. 나를 모르면 null */
  async function mySavedPlaceIds(): Promise<Set<string> | null> {
    if (!myMemberId) return null;
    const ids = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = await getSavedPlaces(tripId, { filter: 'ALL', memberId: myMemberId }, cursor);
      // 서버가 이미 나로 거르지만, 담은 동행에 내가 있는지 한 번 더 본다
      page.items
        .filter((i) => i.savedBy.some((b) => b.memberId === myMemberId))
        .forEach((i) => ids.add(i.place.id));
      cursor = page.page.hasNext ? page.page.nextCursor : null;
    } while (cursor);
    return ids;
  }

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

  /**
   * 장소들을 내 이름으로 담는다. 하나씩 차례로 보낸다. 담은 수(이미 담겨 있던 것 포함)를 돌려준다.
   * 내가 담은 장소를 확인하지 못하면 메모를 지울 수 있어 보내지 않고 알린다
   */
  async function add(placeIds: string[]): Promise<number> {
    const result = await run(placeIds, async () => {
      let mine: Set<string> | null;
      try {
        mine = await mySavedPlaceIds();
      } catch {
        mine = null;
      }
      if (!mine) return { added: 0, already: 0, unknown: true };
      let added = 0;
      let already = 0;
      for (const id of placeIds) {
        if (mine.has(id)) {
          already += 1;
          continue;
        }
        try {
          await putMySave(tripId, id);
          added += 1;
        } catch {
          // 하나가 실패해도 나머지는 담는다
        }
      }
      return { added, already, unknown: false };
    });
    // 같은 장소를 보내는 중이라 이번 누름을 건너뛰었다
    if (result === null) return 0;
    if (result.unknown) {
      toast.error('담지 못했어요. 다시 시도해 주세요');
      return 0;
    }
    await refresh();
    const done = result.added + result.already;
    if (done === placeIds.length) {
      if (result.added === 0) toast.show('이미 담은 장소예요');
      else
        toast.success(
          done > 1 ? `${done}곳을 그룹 즐겨찾기에 담았어요` : '그룹 즐겨찾기에 담았어요',
        );
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
    // 이미 보내는 중이라 이번 누름을 건너뛰었으면 그 요청이 끝나며 다시 받는다
    if (ok === null) return false;
    await refresh();
    if (ok) toast.success('메모를 저장했어요');
    return ok;
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
