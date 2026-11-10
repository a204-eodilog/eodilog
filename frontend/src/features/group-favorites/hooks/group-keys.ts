import { tripKey } from '@/features/trip/hooks/use-trip';

import type { ListQuery } from '../types';

/**
 * 그룹 즐겨찾기 전부의 앞부분. 개인 즐겨찾기 화면(features/saved)의 그룹 담기가
 * ['trips', tripId, 'saved-places']를 무효화하므로 같은 키 아래에 둔다
 */
export const savedPlacesRoot = (tripId: string) => [...tripKey(tripId), 'saved-places'] as const;

export const savedListKey = (tripId: string, query: ListQuery) =>
  [...savedPlacesRoot(tripId), 'list', query.filter, query.memberId ?? 'all'] as const;

export const coursePlacesKey = (tripId: string) =>
  [...tripKey(tripId), 'itinerary', 'places'] as const;
