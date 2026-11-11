import { useQuery } from '@tanstack/react-query';

import { getTripSavedPlaces } from '../api';
import { pollSourceKey } from './poll-keys';

/**
 * 투표 후보 출처인 그룹 즐겨찾기 전체(research R5).
 * 시트를 여는 버튼이 보일 때부터 미리 받는다(enabled). 시트가 열린 뒤에야 받으면 시트가 다 올라온 다음에 목록이 나타난다
 * 장소 저장 시트가 ['trips', tripId, 'saved-places']를 무효화하면 함께 새로 받는다
 */
export function useSavedPlaces(tripId: string, enabled: boolean) {
  return useQuery({
    queryKey: pollSourceKey(tripId),
    queryFn: ({ signal }) => getTripSavedPlaces(tripId, signal),
    enabled,
  });
}
