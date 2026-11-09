import { tripKey } from '@/features/trip/hooks/use-trip';

/** 여행의 지금 코스. 여행 캐시 아래에 두어 여행을 나가면 함께 버려진다 */
export const itineraryKey = (tripId: string) => [...tripKey(tripId), 'itinerary'] as const;

/**
 * 그룹 즐겨찾기 전부. 장소 저장 시트(features/saved)가 ['trips', tripId, 'saved-places']를 무효화하면
 * 이 키도 앞부분이 같아 함께 다시 받는다
 */
export const courseSavedPlacesKey = (tripId: string) =>
  [...tripKey(tripId), 'saved-places', 'course-source'] as const;
