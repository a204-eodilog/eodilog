import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { API_ERROR, toApiError } from '@/api/errors';
import { toast } from '@/components/ui';

import { getItinerary, replaceItinerary } from '../api';
import { itemCount, MAX_ITEMS, sameContent, toWrite, type CourseDraft } from '../course-rules';
import type { Itinerary } from '../types';

import { itineraryKey } from './course-keys';

export type SaveResult =
  | { kind: 'saved'; itinerary: Itinerary }
  | { kind: 'unchanged' }
  /** 다른 동행이 먼저 저장했다. latest로 초안을 다시 채운다 */
  | { kind: 'conflict'; latest: Itinerary | null }
  | { kind: 'failed' };

/**
 * [완료] 저장. 초안을 규칙에 맞는 전체 교체 본문으로 바꿔 보낸다(확정 단계 없음, 결정 F-15).
 * 한 번 누른 것이 끝나기 전에는 다시 보내지 않고, 바뀐 게 없으면 보내지 않는다.
 * 409면 덮어쓰지 않고 최신 코스를 돌려준다. 422·400·연결 오류는 초안을 그대로 두고 안내한다.
 */
export function useSaveItinerary(tripId: string) {
  const queryClient = useQueryClient();
  const sending = useRef(false);
  const [saving, setSaving] = useState(false);

  async function save(draft: CourseDraft, saved: Itinerary | undefined): Promise<SaveResult> {
    if (sending.current) return { kind: 'failed' };
    if (saved && saved.version === draft.baseVersion && sameContent(draft, saved)) {
      return { kind: 'unchanged' };
    }
    if (itemCount(draft) > MAX_ITEMS) {
      toast.show(`장소는 ${MAX_ITEMS}곳까지 넣을 수 있어요`);
      return { kind: 'failed' };
    }
    sending.current = true;
    setSaving(true);
    try {
      const result = await replaceItinerary(tripId, toWrite(draft));
      queryClient.setQueryData(itineraryKey(tripId), result);
      return { kind: 'saved', itinerary: result };
    } catch (e) {
      if (toApiError(e).code === API_ERROR.VERSION_CONFLICT) {
        // 앱 기본 staleTime(30초) 안이면 fetchQuery가 받아 둔 옛 코스를 그대로 준다. 충돌 뒤에는 늘 서버에서 받는다
        const latest = await queryClient
          .fetchQuery({
            queryKey: itineraryKey(tripId),
            queryFn: () => getItinerary(tripId),
            staleTime: 0,
          })
          .catch(() => null);
        toast.show('다른 동행이 먼저 코스를 고쳤어요. 최신 코스를 불러왔어요');
        return { kind: 'conflict', latest };
      }
      toast.error('코스를 저장하지 못했어요. 다시 시도해 주세요');
      return { kind: 'failed' };
    } finally {
      sending.current = false;
      setSaving(false);
    }
  }

  return { save, saving };
}
