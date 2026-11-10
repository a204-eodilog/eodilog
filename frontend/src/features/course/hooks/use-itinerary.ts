import { useQuery } from '@tanstack/react-query';

import { toApiError } from '@/api/errors';

import { getItinerary } from '../api';

import { itineraryKey } from './course-keys';

/**
 * 여행의 지금 코스. 실시간 갱신이 없으므로 화면을 열 때마다 다시 받는다.
 * 없거나 볼 수 없는 여행(404)과 잘못된 주소(400)는 재시도하지 않는다.
 */
export function useItinerary(tripId: string) {
  return useQuery({
    queryKey: itineraryKey(tripId),
    queryFn: ({ signal }) => getItinerary(tripId, signal),
    refetchOnMount: 'always',
    retry: (count, e) => {
      const { status } = toApiError(e);
      return status !== 404 && status !== 400 && count < 1;
    },
  });
}
