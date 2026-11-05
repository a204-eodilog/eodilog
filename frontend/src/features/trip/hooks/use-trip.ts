import {
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';

import { API_ERROR, toApiError } from '@/api/errors';
import type { PageResponse } from '@/api/types';

import { getTrip } from '../api';
import { forgetInviteLink } from '../invite-storage';
import type { Trip } from '../types';

import { MY_TRIPS_KEY } from './use-my-trips';

export const tripKey = (tripId: string) => ['trips', tripId] as const;

/** 여행 탭 목록에 이미 받아 둔 같은 여행. 상세를 열 때 서버 응답을 기다리지 않고 먼저 그린다 */
function tripFromList(queryClient: QueryClient, tripId: string): Trip | undefined {
  const list = queryClient.getQueryData<InfiniteData<PageResponse<Trip>>>(MY_TRIPS_KEY);
  return list?.pages.flatMap((p) => p.data).find((t) => t.id === tripId);
}

/**
 * 여행 상세. 참여하지 않았거나 나간·지운 여행은 서버가 404 TRIP_NOT_FOUND로 답한다.
 * 잘못된 주소(400)도 같은 안내를 보인다. 이 둘은 다시 시도해도 같으므로 재시도하지 않는다.
 * 목록에서 들어오면 목록의 여행으로 바로 그리고(로딩 화면이 번쩍이지 않게), 받은 응답으로 바꾼다.
 */
export function useTrip(tripId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: tripKey(tripId),
    queryFn: () => getTrip(tripId),
    placeholderData: () => tripFromList(queryClient, tripId),
    retry: (count, e) => {
      const { status } = toApiError(e);
      return status !== 404 && status !== 400 && count < 1;
    },
  });

  const error = query.error ? toApiError(query.error) : null;
  const notFound =
    error !== null && (error.code === API_ERROR.TRIP_NOT_FOUND || error.status === 400);
  const gone = error?.code === API_ERROR.TRIP_NOT_FOUND;

  // 다른 기기에서 내보내졌거나 여행이 삭제됐다. 이 기기에 남긴 그 여행의 초대 링크도 지운다(동행 명세 FR-033)
  useEffect(() => {
    if (!gone) return;
    forgetInviteLink(tripId).catch(() => undefined);
    queryClient.setQueryData([...tripKey(tripId), 'invite'], null);
  }, [gone, tripId, queryClient]);

  return { ...query, notFound };
}
