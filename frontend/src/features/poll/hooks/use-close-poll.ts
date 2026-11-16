import { useMutation, useQueryClient } from '@tanstack/react-query';

import { API_ERROR, toApiError } from '@/api/errors';

import { closePoll } from '../api';
import type { Poll } from '../types';
import { pollKey, pollsKey } from './poll-keys';

/** 종료 요청이 거절된 까닭. 화면이 이 값으로 안내를 고른다 */
export type ClosePollFailure =
  /** 이미 마감됐거나 마감 시각이 지났다. 다시 받아 결과 화면이 된다 */
  | 'closed'
  /** 그사이 후보가 추가됐다. 다시 받아 새 후보를 보인 뒤 한 번 더 확인받는다 */
  | 'changed'
  /** 내가 연 투표가 아니다. 다시 받으면 종료 버튼이 사라진다 */
  | 'forbidden'
  /** 그 밖의 실패(통신 등). 확인 창에 남아 다시 누를 수 있다 */
  | 'failed';

export class ClosePollError extends Error {
  constructor(readonly reason: ClosePollFailure) {
    super(reason);
  }
}

/**
 * 투표를 연 사람이 마감 시각 전에 직접 끝낸다(POST .../close).
 * 성공하면 응답의 마감된 투표를 캐시에 넣어 화면이 바로 결과로 바뀐다. 지역 투표가 확정되면
 * usePoll이 여행 상세·목록을 새로 받는다(자동 마감과 같은 길).
 * 거절되면 투표를 다시 받아 최신 상태를 보이고, 까닭을 ClosePollError로 알린다.
 * 두 번 누르기는 isPending으로 화면이 막는다(서버는 Idempotency-Key를 받지 않는다)
 */
export function useClosePoll(tripId: string, pollId: string) {
  const queryClient = useQueryClient();
  const key = pollKey(tripId, pollId);

  return useMutation<Poll, ClosePollError, number>({
    mutationFn: async (expectedVersion) => {
      try {
        return await closePoll(tripId, pollId, expectedVersion);
      } catch (e) {
        const { code, status } = toApiError(e);
        const reason: ClosePollFailure =
          code === API_ERROR.POLL_CLOSED
            ? 'closed'
            : code === API_ERROR.VERSION_CONFLICT
              ? 'changed'
              : status === 403
                ? 'forbidden'
                : 'failed';
        if (reason !== 'failed') {
          await queryClient.refetchQueries({ queryKey: key, exact: true });
        }
        throw new ClosePollError(reason);
      }
    },
    onSuccess: (closed) => {
      queryClient.setQueryData(key, closed);
      // 목록(대표 투표 고르기)도 마감된 상태로 다시 받는다
      void queryClient.invalidateQueries({ queryKey: pollsKey(tripId), exact: true });
    },
  });
}
