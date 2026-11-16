import { useQuery } from '@tanstack/react-query';

import { toApiError } from '@/api/errors';
import { getItinerary } from '@/features/course/api';
import { itineraryKey } from '@/features/course/hooks/course-keys';
import { getSettlementState } from '@/features/expense/api';
import { expenseKeys } from '@/features/expense/hooks/use-expense-board';
import { getPhotoSummary } from '@/features/photo/api';
import { photoKeys } from '@/features/photo/hooks/use-trip-photos';

import { getSavedPlaceCount } from '../api';
import type { TripProgress } from '../trip-rules';

import { tripKey } from './use-trip';

const retryUnlessGone = (count: number, e: unknown) => {
  const { status } = toApiError(e);
  return status !== 404 && status !== 400 && count < 1;
};

/**
 * 계획 중인 여행이 어디까지 왔는지(모은 장소 수, 코스에 넣은 장소 수). 여행 상세(S17)의 단계에 쓴다.
 * enabled가 false(계획 중이 아님)이면 받지 않는다. 받는 중이거나 받지 못한 값은 null이다.
 * 코스는 코스 화면과, 모은 장소는 그룹 즐겨찾기와 같은 캐시 갈래라 고치고 돌아오면 바로 맞는다
 */
export function useTripProgress(tripId: string, enabled: boolean): TripProgress {
  const itinerary = useQuery({
    queryKey: itineraryKey(tripId),
    queryFn: ({ signal }) => getItinerary(tripId, signal),
    enabled,
    retry: retryUnlessGone,
  });
  const saved = useQuery({
    // 장소를 담거나 빼면 ['trips', tripId, 'saved-places']가 무효화돼 이 값도 다시 받는다
    queryKey: [...tripKey(tripId), 'saved-places', 'count'] as const,
    queryFn: ({ signal }) => getSavedPlaceCount(tripId, signal),
    enabled,
    retry: retryUnlessGone,
  });

  const items = itinerary.data?.items;
  return {
    savedPlaceCount: enabled && typeof saved.data === 'number' ? saved.data : null,
    coursePlaceCount: enabled && Array.isArray(items) ? items.length : null,
  };
}

/**
 * 다녀온 여행이 어디까지 왔는지(올린 사진 수, 정산했는지). 여행 상세의 사진·정산 단계에 쓴다.
 * 사진 목록·경비 화면과 같은 캐시라 올리거나 정산하고 돌아오면 바로 맞는다. 받지 못한 값은 null이다
 */
export function useAfterTripProgress(tripId: string, enabled: boolean) {
  const summary = useQuery({
    queryKey: photoKeys.summary(tripId),
    queryFn: () => getPhotoSummary(tripId),
    enabled,
    retry: retryUnlessGone,
  });
  const settlement = useQuery({
    queryKey: expenseKeys.settlement(tripId),
    queryFn: () => getSettlementState(tripId),
    enabled,
    retry: retryUnlessGone,
  });
  return {
    photoCount: enabled && summary.data ? summary.data.totalCount : null,
    settled:
      enabled && settlement.data
        ? settlement.data.current !== null && !settlement.data.recalculationRequired
        : null,
  };
}
