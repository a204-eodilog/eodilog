import { useMutation, useQueryClient } from '@tanstack/react-query';

import { toApiError, type ApiError } from '@/api/errors';

import { createPoll } from '../api';
import { pollTitle } from '../poll-rules';
import type { CandidateInput, Poll, PollType } from '../types';
import { pollKey, pollsKey } from './poll-keys';

export type OpenPollInput = {
  type: PollType;
  candidates: CandidateInput[];
  closesAt: Date;
  /** 다시 열기는 같은 제목을 쓴다. 없으면 유형별 자동 제목 */
  title?: string;
};

/**
 * N8 [투표 열기]와 0표 화면의 [다시 열기].
 * 성공하면 새 투표를 캐시에 넣고 목록을 다시 받는다. 요청 중에는 isPending으로 버튼을 막는다(plan 두 번 누르기)
 */
export function useOpenPoll(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation<Poll, ApiError, OpenPollInput>({
    mutationFn: async ({ type, candidates, closesAt, title }) => {
      try {
        return await createPoll(tripId, {
          type,
          title: title ?? pollTitle(type),
          candidates,
          closesAt: closesAt.toISOString(),
        });
      } catch (e) {
        throw toApiError(e);
      }
    },
    onSuccess: (poll) => {
      queryClient.setQueryData(pollKey(tripId, poll.id), poll);
      void queryClient.invalidateQueries({ queryKey: pollsKey(tripId), exact: true });
    },
  });
}

/** 서버 거절을 시트 안 한 줄로. 필드 오류가 있으면 그 문구, 끊김이면 다시 해 보라는 안내 */
export function openPollErrorText(error: ApiError): string {
  const field = error.fields.closesAt ?? error.fields.candidates ?? error.fields.title;
  if (field) return field;
  if (error.kind !== 'http') return '투표를 열지 못했어요. 연결을 확인하고 다시 눌러 주세요';
  return '투표를 열지 못했어요. 다시 눌러 주세요';
}
