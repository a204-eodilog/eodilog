import { useQuery } from '@tanstack/react-query';

import { getCoursePlaces } from '../api';

import { coursePlacesKey } from './group-keys';

/** 코스에 든 장소. 내 저장을 뺄 때 코스에 있으면 확인을 띄우는 데 쓴다 */
export function useCoursePlaces(tripId: string) {
  return useQuery({
    queryKey: coursePlacesKey(tripId),
    queryFn: ({ signal }) => getCoursePlaces(tripId, signal),
    refetchOnMount: 'always',
  });
}
