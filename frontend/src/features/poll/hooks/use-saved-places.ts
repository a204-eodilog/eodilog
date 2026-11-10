import { useQuery } from '@tanstack/react-query';

import { getTripSavedPlaces } from '../api';
import { pollSourceKey } from './poll-keys';

/**
 * 투표 후보 출처인 그룹 즐겨찾기 전체(research R5). 시트를 열 때만 받는다(enabled).
 * 장소 저장 시트가 ['trips', tripId, 'saved-places']를 무효화하면 함께 새로 받는다
 */
export function useSavedPlaces(tripId: string, enabled: boolean) {
  return useQuery({
    queryKey: pollSourceKey(tripId),
    queryFn: ({ signal }) => getTripSavedPlaces(tripId, signal),
    enabled,
  });
}
