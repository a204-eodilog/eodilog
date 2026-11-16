import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useConnectionStore } from '@/realtime/connection-store';

import { FIRST_PAGE_LIMIT, getMessages, OLDER_PAGE_LIMIT } from '../api';
import {
  beginFirstLoad,
  catchUp,
  endFirstLoad,
  markRoomOpen,
  receive,
  watchLatest,
} from '../chat-inbound';
import { catchUpOptions } from '../catch-up-options';
import { isBlocked } from '../chat-rules';
import { chatSync, eitherSignal } from '../sync-session';
import type { MessageWindow } from '../types';

import { blockRoom } from './block-room';
import { chatMessagesKey } from './chat-keys';
import { useIsChatBlocked } from './use-chat-blocked';

export type OlderState = 'idle' | 'loading' | 'error';

/**
 * S47 메시지 창(research R6·R7). 페이지 묶음(useInfiniteQuery) 대신 한 줄로 이어진 MessageWindow를 둔다.
 * 처음 받기는 queryFn이, 이전 메시지는 loadOlder가 하고 둘 다 입구 하나(chat-inbound.ts의 receive)로만 바꾼다.
 * 다시 받을지는 이어 받기 규칙이 정하므로 staleTime은 Infinity다
 */
export function useMessages(tripId: string, roomId: string | undefined) {
  const queryClient = useQueryClient();
  const key = chatMessagesKey(tripId);
  const alreadyBlocked = useIsChatBlocked(tripId);

  const query = useQuery({
    queryKey: key,
    // 차단된 방은 다시 요청하지 않는다
    enabled: !!roomId && !alreadyBlocked,
    queryFn: async ({ signal }) => {
      // 응답을 기다리는 사이 실시간으로 온 메시지는 창이 없어 버려지므로 모아 둔다.
      // 응답이 그 메시지보다 먼저 만들어졌으면 응답에도 없어서, 모아 둔 것을 함께 합쳐야 빠지지 않는다
      const s = chatSync();
      beginFirstLoad(tripId);
      try {
        // 화면을 떠나 쿼리가 취소되거나 로그아웃하면 요청을 끊는다
        const page = await getMessages(
          roomId!,
          { limit: FIRST_PAGE_LIMIT },
          eitherSignal(signal, s.signal),
        );
        // 기다리는 사이 로그아웃했다. 비운 캐시에 창을 다시 만들지 않는다
        if (s.stopped) throw new Error('chat session stopped');
        const base = queryClient.getQueryData<MessageWindow>(key);
        // 입구 하나(receive)가 모아 둔 실시간 메시지와 함께 창을 만든다
        receive(queryClient, tripId, roomId!, page.data, 'first-load', {
          hasOlder: base && base.messages.length > 0 ? base.hasOlder : page.page.hasNext,
        });
        return queryClient.getQueryData<MessageWindow>(key)!;
      } finally {
        endFirstLoad(tripId);
      }
    },
    staleTime: Infinity,
    retry: (count, error) => !isBlocked(error) && count < 2,
  });

  const blocked = query.isError && isBlocked(query.error);
  useEffect(() => {
    if (blocked) void blockRoom(queryClient, tripId);
  }, [blocked, queryClient, tripId]);

  // 이 방이 화면에 열려 있다고 알린다. 다시 연결되면 열린 방만 바로 이어 받는다(research R5).
  // 창이 이미 있으면(전에 열었던 방) 열 때 한 번 이어 받는다. 최근 메시지의 지운 표시도 여기서 바뀐다
  useEffect(() => {
    const close = markRoomOpen(tripId);
    if (queryClient.getQueryData<MessageWindow>(key)) {
      void catchUp(queryClient, tripId, catchUpOptions(queryClient));
    }
    return close;
    // key는 tripId로 정해진다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, tripId]);

  // 마지막 메시지 유실 대비: 방이 열려 있고 앱이 앞에 있고 연결된 동안 간격마다 서버의 최신 1개를 확인한다
  useEffect(() => {
    if (!roomId || alreadyBlocked) return;
    return watchLatest(queryClient, tripId, roomId, isChatLive);
  }, [queryClient, tripId, roomId, alreadyBlocked]);

  const [olderState, setOlderState] = useState<OlderState>('idle');
  const loadingOlder = useRef(false);

  /** 위 끝에 닿으면 더 오래된 메시지를 받는다. 진행 중이면 다시 부르지 않는다. 실패해도 창은 그대로다 */
  const loadOlder = useCallback(async () => {
    const current = queryClient.getQueryData<MessageWindow>(key);
    if (!roomId || !current?.hasOlder || current.oldestSequence === null || loadingOlder.current) {
      return;
    }
    loadingOlder.current = true;
    setOlderState('loading');
    const s = chatSync();
    try {
      const page = await getMessages(
        roomId,
        { beforeSequence: current.oldestSequence, limit: OLDER_PAGE_LIMIT },
        s.signal,
      );
      if (s.stopped) return;
      receive(queryClient, tripId, roomId, page.data, 'older', { hasOlder: page.page.hasNext });
      setOlderState('idle');
    } catch (error) {
      if (isBlocked(error)) void blockRoom(queryClient, tripId);
      setOlderState('error');
    } finally {
      loadingOlder.current = false;
    }
    // key는 tripId로 정해진다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, tripId, roomId]);

  return {
    window: query.data,
    isLoading: query.isPending && !!roomId,
    // 받아 둔 메시지가 있으면 다시 받기에 실패해도 오류 화면으로 가리지 않는다(TanStack v5는 실패해도 data를 남긴다).
    // 앱 복귀 때 다시 받다 실패하면 대화가 통째로 오류 화면이 되고 읽던 자리를 잃었다(2026-11-10 점검)
    isError: query.isError && query.data === undefined,
    blocked: alreadyBlocked || blocked,
    refetch: query.refetch,
    olderState,
    loadOlder,
  };
}

/** 앱이 앞에 있고 실시간이 연결돼 있는지. 끊긴 동안 놓친 것은 다시 연결할 때 이어 받기가 채운다 */
function isChatLive() {
  return (
    AppState.currentState === 'active' && useConnectionStore.getState().state.kind === 'connected'
  );
}
