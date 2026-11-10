import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';

import { toApiError } from '@/api/errors';
import type { PageResponse } from '@/api/types';
import { toast } from '@/components/ui';
import { getAllMyTrips } from '@/features/my-trips/api';

import { dismissNotification, getNotifications, readAllNotifications } from '../api';
import { latestCreatedAt } from '../notification-rules';
import type { NotificationView } from '../types';

import { MY_ALL_TRIPS_KEY, notificationKeys } from './notification-keys';

type Pages = InfiniteData<PageResponse<NotificationView>, string | null>;

/** 받아 둔 목록의 알림 하나를 바꾸거나(change가 null이면) 뺀다 */
export function patchListed(
  queryClient: QueryClient,
  id: string,
  change: ((n: NotificationView) => NotificationView) | null,
) {
  queryClient.setQueryData<Pages>(notificationKeys.list, (old) =>
    old
      ? {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            data: change
              ? p.data.map((n) => (n.id === id ? change(n) : n))
              : p.data.filter((n) => n.id !== id),
          })),
        }
      : old,
  );
}

/** 홈 종 숫자와 팝업이 다음에 서버 값을 받게 한다 */
export function refreshUnread(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: notificationKeys.summary });
  void queryClient.invalidateQueries({ queryKey: notificationKeys.popup });
}

/**
 * S49 알림 목록. 최신부터 20개씩 이어 받고, 내 여행 전체 목록으로 나간 여행을 가린다(Q-12-5).
 * 모두 읽음은 받은 알림 중 가장 늦은 시각까지만 보낸다(Q-12-6).
 */
export function useNotifications() {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: notificationKeys.list,
    queryFn: ({ pageParam }) => getNotifications({ cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.page.hasNext ? last.page.nextCursor : undefined),
  });
  // 못 받으면 나간 여행 표시만 빠진다
  // 나간 여행 표시는 내 여행 목록이 새것이어야 맞다. 새 여행에 막 참여했는데 옛 목록이면 멀쩡한 알림에 붙는다
  const trips = useQuery({
    queryKey: MY_ALL_TRIPS_KEY,
    queryFn: getAllMyTrips,
    retry: false,
    refetchOnMount: 'always',
  });

  const items = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  const myTripIds = useMemo(
    () => (trips.data ? new Set(trips.data.map((t) => t.id)) : null),
    [trips.data],
  );
  const hasUnread = items.some((n) => n.readAt === null);

  const markingAll = useRef(false);
  const readAll = useCallback(async () => {
    const through = latestCreatedAt(items);
    if (!through || markingAll.current) return;
    markingAll.current = true;
    const before = queryClient.getQueryData<Pages>(notificationKeys.list);
    const at = new Date().toISOString();
    queryClient.setQueryData<Pages>(notificationKeys.list, (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              data: p.data.map((n) => (n.readAt ? n : { ...n, readAt: at })),
            })),
          }
        : old,
    );
    try {
      await readAllNotifications(through);
    } catch {
      queryClient.setQueryData(notificationKeys.list, before);
      toast.error('읽음으로 바꾸지 못했어요. 다시 시도해 주세요');
    } finally {
      markingAll.current = false;
      refreshUnread(queryClient);
    }
  }, [items, queryClient]);

  return {
    items,
    myTripIds,
    hasUnread,
    isPending: query.isPending,
    isError: query.isError && !query.data,
    /** 불러오기 실패의 원인. 오류 화면이 아이콘과 짧은 제목을 고른다 */
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    retry: () => void query.refetch(),
    readAll,
  };
}

/** 내 목록에서 알림 하나를 지운다. 실패하면 알리고 false */
export function useDismissNotification() {
  const queryClient = useQueryClient();
  return useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await dismissNotification(id);
        patchListed(queryClient, id, null);
        toast.show('알림을 지웠어요');
        return true;
      } catch (e) {
        // 나간 여행이나 지워진 여행의 알림은 서버가 찾지 못해 404로 답한다. 목록에서도 이미 보이지 않으니 지운 것으로 본다
        if (toApiError(e).status === 404) {
          patchListed(queryClient, id, null);
          toast.show('알림을 지웠어요');
          return true;
        }
        toast.error('알림을 지우지 못했어요. 다시 시도해 주세요');
        return false;
      } finally {
        refreshUnread(queryClient);
      }
    },
    [queryClient],
  );
}
