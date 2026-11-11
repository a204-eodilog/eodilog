import { useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { PageResponse } from '@/api/types';
import { MY_TRIPS_KEY } from '@/features/trip/hooks/use-my-trips';
import { tripKey } from '@/features/trip/hooks/use-trip';
import type { Trip } from '@/features/trip/types';

import { getTripChatRoom } from '../api';
import { isBlocked } from '../chat-rules';
import { rememberRooms } from '../room-index';

import { blockRoom } from './block-room';
import { chatRoomKey } from './chat-keys';
import { useIsChatBlocked } from './use-chat-blocked';
import { FALLBACK_ROOM_TITLE } from './use-chat-rooms';

/**
 * S47의 대화방. S46에서 들어오면 목록 값으로 미리 채워져 요청하지 않는다.
 * 이름은 이미 받아 둔 여행(상세 → 여행 목록 순)에서 찾는다(research R11)
 */
export function useChatRoom(tripId: string) {
  const queryClient = useQueryClient();
  const alreadyBlocked = useIsChatBlocked(tripId);
  const query = useQuery({
    queryKey: chatRoomKey(tripId),
    queryFn: ({ signal }) => getTripChatRoom(tripId, signal),
    // 차단된 방은 다시 요청하지 않는다
    enabled: !alreadyBlocked,
    // 볼 수 없는 여행이면 다시 시도하지 않는다
    retry: (count, error) => !isBlocked(error) && count < 2,
  });

  useEffect(() => {
    if (query.data) rememberRooms([query.data]);
  }, [query.data]);

  const blocked = query.isError && isBlocked(query.error);
  useEffect(() => {
    if (blocked) void blockRoom(queryClient, tripId);
  }, [blocked, queryClient, tripId]);

  const trip =
    queryClient.getQueryData<Trip>(tripKey(tripId)) ??
    queryClient
      .getQueryData<InfiniteData<PageResponse<Trip>>>(MY_TRIPS_KEY)
      ?.pages.flatMap((p) => p.data)
      .find((t) => t.id === tripId);

  return {
    room: query.data,
    title: trip?.title ?? FALLBACK_ROOM_TITLE,
    isLoading: query.isPending,
    // 받아 둔 방 정보가 있으면 다시 받기에 실패해도 오류로 보지 않는다. 앱 복귀·새 동행 알림으로 다시 받다
    // 실패하면 메시지까지 오류 화면에 가려졌다(2026-11-10 점검). 볼 수 없게 된 방(blocked)은 따로 본다
    isError: query.isError && query.data === undefined,
    blocked: alreadyBlocked || blocked,
    refetch: query.refetch,
  };
}
