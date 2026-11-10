import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { API_ERROR, toApiError } from '@/api/errors';
import { toast } from '@/components/ui';

import { replaceBallot } from '../api';
import { createBallotQueue, sameSelection, type BallotQueue } from '../ballot-queue';
import { applyMyBallot } from '../poll-rules';
import type { Poll } from '../types';
import { pollKey } from './poll-keys';

/** 마지막 저장 실패. conflict 후보 추가로 버전이 바뀜, network 연결·서버 문제 */
export type BallotFailure = { kind: 'conflict' | 'network'; wanted: string[] };

/**
 * 진행 중 투표의 내 선택(FR-004~FR-007, research R2·R3).
 * - 후보를 누르면 화면의 선택과 표 수를 바로 바꾸고(applyMyBallot), 저장은 ballot-queue가 하나로 합쳐 보낸다
 * - 409 VERSION_CONFLICT: 투표를 다시 받고, 저장돼 있던 선택은 그대로 보이며 고르려던 선택은 실패 정보로 남긴다(Figma 201-29384)
 * - 409 POLL_CLOSED: 다시 받아 결과 화면으로 바뀌게 하고 "투표가 마감됐어요"
 * - 연결·서버 문제: 저장된 선택으로 되돌리고 실패 정보로 남긴다
 */
export function useBallot(tripId: string, poll: Poll | undefined) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string[] | null>(null);
  const [failure, setFailure] = useState<BallotFailure | null>(null);
  const pollId = poll?.id ?? '';

  const latest = () => queryClient.getQueryData<Poll>(pollKey(tripId, pollId));
  const refetch = () =>
    queryClient.refetchQueries({ queryKey: pollKey(tripId, pollId), exact: true });

  const queueRef = useRef<BallotQueue | null>(null);
  const queue = () => {
    queueRef.current ??= createBallotQueue({
      send: async (ids) => {
        const current = latest();
        if (!current) throw new Error('투표를 아직 받지 못했어요');
        const updated = await replaceBallot(tripId, current.id, ids, current.version);
        queryClient.setQueryData(pollKey(tripId, current.id), updated);
        if (!queueRef.current?.busy()) setDraft(null);
        return updated.myCandidateIds;
      },
      onError: (error, wanted) => {
        const { code } = toApiError(error);
        setDraft(null);
        void refetch();
        if (code === API_ERROR.POLL_CLOSED) {
          setFailure(null);
          toast.show('투표가 마감됐어요');
          return;
        }
        setFailure({ kind: code === API_ERROR.VERSION_CONFLICT ? 'conflict' : 'network', wanted });
      },
    });
    return queueRef.current;
  };

  const saved = poll?.myCandidateIds ?? [];
  const selected = draft ?? saved;
  const view = poll ? applyMyBallot(poll, selected) : undefined;

  const submit = (next: string[]) => {
    setFailure(null);
    setDraft(next);
    queue().submit(next, latest()?.myCandidateIds ?? saved);
  };

  return {
    /** 화면에 보일 투표(내 선택과 표 수가 낙관적으로 반영됨) */
    view,
    selected,
    failure,
    toggle(candidateId: string) {
      submit(
        selected.includes(candidateId)
          ? selected.filter((id) => id !== candidateId)
          : [...selected, candidateId],
      );
    },
    cancel() {
      submit([]);
    },
    retry() {
      if (!failure) return;
      const valid = new Set((latest() ?? poll)?.candidates.map((c) => c.id));
      const wanted = failure.wanted.filter((id) => valid.has(id));
      if (sameSelection(wanted, latest()?.myCandidateIds ?? saved)) {
        setFailure(null);
        return;
      }
      submit(wanted);
    },
  };
}
