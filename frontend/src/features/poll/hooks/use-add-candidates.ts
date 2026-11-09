import { useMutation, useQueryClient } from '@tanstack/react-query';

import { API_ERROR, toApiError } from '@/api/errors';

import { addCandidate, getPoll } from '../api';
import type { CandidateInput, Poll } from '../types';
import { pollKey } from './poll-keys';

export type AddCandidatesResult = {
  /** 넣은 수 */
  added: number;
  /** 이미 있거나 30곳이 넘어 건너뛴 수 */
  skipped: number;
  /** 넣는 사이 마감됐다 */
  closed: boolean;
};

const keyOf = (input: CandidateInput) => ('regionId' in input ? input.regionId : input.placeId);
const has = (poll: Poll, input: CandidateInput) =>
  poll.candidates.some((c) => (c.regionId ?? c.placeId) === keyOf(input));

/**
 * 진행 중 투표에 고른 후보를 차례로 넣는다(FR-015~FR-017, research R3).
 * - 409 VERSION_CONFLICT: 다른 동행이 먼저 넣었다. 다시 받아 그 버전으로 한 번만 다시 넣고, 그새 같은 곳이 들어갔으면 건너뛴다
 * - 400(이미 있음·30곳 넘음): 그 후보만 건너뛴다
 * - 409 POLL_CLOSED: 멈추고 다시 받아 결과 화면이 되게 한다
 * 요청 중에는 isPending으로 [후보에 넣기]를 막는다
 */
export function useAddCandidates(tripId: string, pollId: string) {
  const queryClient = useQueryClient();
  const key = pollKey(tripId, pollId);

  return useMutation<AddCandidatesResult, Error, CandidateInput[]>({
    mutationFn: async (inputs) => {
      let current = queryClient.getQueryData<Poll>(key) ?? (await getPoll(tripId, pollId));
      const result: AddCandidatesResult = { added: 0, skipped: 0, closed: false };

      for (const input of inputs) {
        if (has(current, input)) {
          result.skipped += 1;
          continue;
        }
        let retried = false;
        for (;;) {
          try {
            current = await addCandidate(tripId, pollId, input, current.version);
            queryClient.setQueryData(key, current);
            result.added += 1;
            break;
          } catch (e) {
            const { code, status } = toApiError(e);
            if (code === API_ERROR.POLL_CLOSED) {
              result.closed = true;
              await queryClient.refetchQueries({ queryKey: key, exact: true });
              return result;
            }
            if (code === API_ERROR.VERSION_CONFLICT && !retried) {
              retried = true;
              current = await getPoll(tripId, pollId);
              queryClient.setQueryData(key, current);
              if (has(current, input)) {
                result.skipped += 1;
                break;
              }
              continue;
            }
            if (status === 400) {
              result.skipped += 1;
              break;
            }
            throw e;
          }
        }
      }
      return result;
    },
  });
}
