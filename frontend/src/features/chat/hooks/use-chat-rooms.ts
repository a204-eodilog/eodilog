import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { useMe } from '@/hooks/use-me';
import { useMyTrips } from '@/features/trip/hooks/use-my-trips';
import { dayIndex, dDay, tripStatus } from '@/features/trip/trip-rules';
import type { Trip } from '@/features/trip/types';

import { getChatRooms } from '../api';
import { roomPreview, roomTimeLabel, sortRooms } from '../chat-rules';
import { rememberRooms } from '../room-index';
import type { ChatRoom } from '../types';

import { CHAT_ROOMS_KEY } from './chat-keys';
import { useChatBlocked } from './use-chat-blocked';

export type ChatRoomRow = {
  room: ChatRoom;
  /** 대화방 이름은 여행 이름이다. 아직 여행 목록을 못 받았으면 "여행 대화방" */
  title: string;
  preview: string;
  /** 최근 메시지 시각. 메시지가 없으면 null */
  time: string | null;
};

/** 맨 위 옅은 파랑 카드로 크게 보이는 지금 여행의 대화방(C안 "지금 여행 먼저", 2026-11-05 사용자 선택) */
export type FeaturedChatRoom = ChatRoomRow & {
  /** "여행 중 · 2일차" 또는 "다가오는 여행 · D-17" */
  kicker: string;
};

export type ChatRoomsStatus = 'loading' | 'error' | 'empty' | 'ready';

/** 여행 탭 맨 위 카드와 같은 말. 여행 중이면 N일차, 아니면 D-N */
export function featuredKicker(trip: Trip, today: string): string {
  if (tripStatus(trip, today) === 'ONGOING') {
    const n = dayIndex(trip, today);
    return `여행 중${n !== null ? ` · ${n}일차` : ''}`;
  }
  const d = dDay(trip, today);
  return `다가오는 여행${d !== null ? ` · D-${d}` : ''}`;
}

/** 대화방 이름을 아직 찾지 못했을 때 */
export const FALLBACK_ROOM_TITLE = '여행 대화방';

/**
 * S46 대화방 목록. 서버는 방을 만든 순서로 나눠 주므로 끝까지 받아 최근 메시지 순으로 다시 놓는다(research R12).
 * 서버 대화방 정보에는 여행 이름이 없어 내 여행 목록 캐시에서 찾는다(research R11)
 */
export function useChatRooms() {
  const query = useInfiniteQuery({
    queryKey: CHAT_ROOMS_KEY,
    queryFn: ({ pageParam, signal }) => getChatRooms(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.page.hasNext ? last.page.nextCursor : undefined),
  });
  const { data, hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query;

  // 실패하면 더 받지 않고 다시 시도를 기다린다(useMyTrips와 같다)
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const rooms = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  // 실시간 이벤트의 roomId로 여행을 찾을 수 있게 표를 채운다
  // 다시 참여해 목록에 다시 나타난 방은 차단 표시를 푼다
  useEffect(() => {
    rememberRooms(rooms);
    useChatBlocked.getState().unblock(rooms.map((r) => r.tripId));
  }, [rooms]);

  const myTrips = useMyTrips();
  const { data: me } = useMe();
  const meId = me?.id ?? null;

  const titles = useMemo(() => {
    const map = new Map<string, string>();
    for (const page of myTrips.data?.pages ?? []) for (const t of page.data) map.set(t.id, t.title);
    return map;
  }, [myTrips.data]);

  const rows = useMemo<ChatRoomRow[]>(
    () =>
      sortRooms(rooms).map((room) => ({
        room,
        title: titles.get(room.tripId) ?? FALLBACK_ROOM_TITLE,
        preview: roomPreview(room, meId),
        time: room.lastMessage ? roomTimeLabel(room.lastMessage.createdAt) : null,
      })),
    [rooms, titles, meId],
  );

  // 지금 여행은 여행 탭과 같은 기준(여행 중 → 다가오는 여행)으로 고른다. 그 방은 목록에서 빼고 위 카드로 보인다
  const { listState, today } = myTrips;
  const featuredTrip = listState.kind === 'ready' ? listState.sections.featured : null;
  const featured = useMemo<FeaturedChatRoom | null>(() => {
    if (!featuredTrip) return null;
    const row = rows.find((r) => r.room.tripId === featuredTrip.id);
    return row ? { ...row, kicker: featuredKicker(featuredTrip, today) } : null;
  }, [rows, featuredTrip, today]);
  const others = useMemo(
    () => (featured ? rows.filter((r) => r.room.id !== featured.room.id) : rows),
    [rows, featured],
  );

  let status: ChatRoomsStatus = 'ready';
  if (!data) status = isError ? 'error' : 'loading';
  else if (rows.length === 0) status = hasNextPage ? 'loading' : 'empty';

  return {
    featured,
    rows: others,
    meId,
    status,
    refetch: query.refetch,
  };
}
