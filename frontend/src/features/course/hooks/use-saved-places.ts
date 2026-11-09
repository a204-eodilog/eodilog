import { useQuery } from '@tanstack/react-query';

import { getTripSavedPlaces } from '../api';

import { courseSavedPlacesKey } from './course-keys';

/** 그룹 즐겨찾기 장소 전부. 직접 만들기의 재료와 구성 방식 선택의 "모은 장소 N곳"에 쓴다 */
export function useTripSavedPlaces(tripId: string, enabled = true) {
  return useQuery({
    queryKey: courseSavedPlacesKey(tripId),
    queryFn: ({ signal }) => getTripSavedPlaces(tripId, signal),
    enabled,
  });
}
