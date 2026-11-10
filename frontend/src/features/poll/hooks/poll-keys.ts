import { tripKey } from '@/features/trip/hooks/use-trip';

// 투표 캐시는 ['trips', tripId] 아래에 둔다. 여행 나가기의 forgetTrip이 함께 지운다(plan 쿼리 키 표)

/** 여행의 투표 목록(첫 쪽) */
export const pollsKey = (tripId: string) => [...tripKey(tripId), 'polls'] as const;

/** 투표 하나 */
export const pollKey = (tripId: string, pollId: string) => [...pollsKey(tripId), pollId] as const;

/** 장소 하나. 이름이 바뀌지 않아 한 번만 받는다 */
export const placeKey = (placeId: string) => ['places', placeId] as const;

/**
 * 후보 출처인 그룹 즐겨찾기 전체. 장소 저장 시트(features/saved)가 저장·삭제 뒤
 * ['trips', tripId, 'saved-places']를 무효화하므로 같은 앞부분을 써서 함께 새로 받는다
 */
export const pollSourceKey = (tripId: string) =>
  [...tripKey(tripId), 'saved-places', 'poll-source'] as const;
