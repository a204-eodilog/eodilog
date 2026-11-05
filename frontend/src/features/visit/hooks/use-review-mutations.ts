import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';

import { apiErrorCode } from '@/api/errors';

import { deleteReview, saveReview } from '../api';
import type { Review, ReviewInput, Visit } from '../types';

import { reviewKeys } from './use-review-board';
import { visitKeys } from './use-visit-board';

/** 내 방문 목록의 점수도 같이 바꿔 S33 내 점수·S38 평가 카드가 돌아갔을 때 바로 맞게 한다 */
function setVisitReview(
  queryClient: QueryClient,
  tripId: string,
  visitId: string,
  review: Review | null,
) {
  queryClient.setQueryData<Visit[]>(visitKeys.myVisits(tripId), (old) =>
    old?.map((v) =>
      v.id === visitId
        ? { ...v, reviewId: review?.id ?? null, reviewScore: review?.score ?? null }
        : v,
    ),
  );
}

function invalidate(queryClient: QueryClient, tripId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: reviewKeys.trip(tripId) }),
    queryClient.invalidateQueries({ queryKey: visitKeys.myVisits(tripId) }),
  ]);
}

/** [저장]. 처음이면 만들고 있으면 고친다. 응답을 바로 목록에 넣어 '남긴 뒤'로 바뀌게 한다 */
export function useSaveReview(tripId: string, visitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) => saveReview(tripId, visitId, input),
    onSuccess: async (review) => {
      queryClient.setQueryData<Review[]>(reviewKeys.trip(tripId), (old = []) => [
        review,
        ...old.filter((r) => r.id !== review.id),
      ]);
      setVisitReview(queryClient, tripId, visitId, review);
      await invalidate(queryClient, tripId);
    },
  });
}

/** 평가 삭제. 이미 지워진 평가(404 REVIEW_NOT_FOUND)는 지운 것과 같으니 실패로 보지 않는다 */
export function useDeleteReview(tripId: string, visitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await deleteReview(tripId, visitId);
      } catch (e) {
        if (apiErrorCode(e) !== 'REVIEW_NOT_FOUND') throw e;
      }
    },
    onSuccess: async () => {
      queryClient.setQueryData<Review[]>(reviewKeys.trip(tripId), (old) =>
        old?.filter((r) => r.visitId !== visitId),
      );
      setVisitReview(queryClient, tripId, visitId, null);
      await invalidate(queryClient, tripId);
    },
  });
}
