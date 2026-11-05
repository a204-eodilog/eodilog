import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { toast } from '@/components/ui';

import { deleteTrip, removeMember, transferOwner } from '../api';
import { FAILURE_MESSAGE, memberActionFailure, type MemberActionFailure } from '../companion-rules';
import type { JobRef, Trip } from '../types';

import { invalidateTripLists, refreshTripAfterConflict } from './trip-cache';
import { tripKey } from './use-trip';
import { useTripEditDraft } from './use-trip-edit-draft';

/**
 * 방장 메뉴 요청이 실패했을 때 공통 처리(research R4).
 * 내가 본 화면이 낡았거나(409·403·대상 없음) 처리하지 못했으면 여행을 다시 받아 최신 화면을 그린다.
 * 자동으로 다시 보내지 않는다. 여행에서 빠졌으면(404) 다시 받는 순간 화면이 '볼 수 없는 여행'이 된다
 */
export async function handleMemberActionFailure(
  queryClient: QueryClient,
  tripId: string,
  error: unknown,
  errorMessage: string,
): Promise<MemberActionFailure> {
  const kind = memberActionFailure(error);
  // 넘기기 400(대상이 참여 중이 아니거나 이미 방장)도 error로 오므로 함께 다시 받는다(contracts §5)
  await refreshTripAfterConflict(queryClient, tripId);
  if (kind === 'error') toast.show(errorMessage);
  else if (kind !== 'tripGone') toast.show(FAILURE_MESSAGE[kind]);
  return kind;
}

/** 방장 넘기기. 성공하면 바뀐 여행으로 캐시를 바꿔 S19가 동행 화면이 된다(FR-019) */
export function useTransferOwner(tripId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (vars: { targetMemberId: string; expectedVersion: number }) =>
      transferOwner(tripId, vars),
    onSuccess: (trip: Trip) => {
      queryClient.setQueryData(tripKey(tripId), trip);
      // S19에서 고치던 값이 있으면 기준만 새 버전으로 옮긴다(convergence T044)
      useTripEditDraft.getState().rebase(trip);
      invalidateTripLists(queryClient);
    },
  });
  const run = async (vars: { targetMemberId: string; expectedVersion: number }) => {
    try {
      await mutation.mutateAsync(vars);
      return true;
    } catch (e) {
      await handleMemberActionFailure(queryClient, tripId, e, '방장을 넘기지 못했어요');
      return false;
    }
  };
  return { run, isPending: mutation.isPending };
}

/** 동행 내보내기. 성공하면 여행을 다시 받아 구성원에서 뺀다(FR-021) */
export function useRemoveMember(tripId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (vars: { memberId: string; expectedVersion: number }) =>
      removeMember(tripId, vars.memberId, vars.expectedVersion),
    onSuccess: async () => {
      invalidateTripLists(queryClient);
      // 204라 바뀐 여행이 없어 다시 받는다. 받은 여행으로 S19 수정 기준도 옮긴다(convergence T044)
      const latest = await refreshTripAfterConflict(queryClient, tripId);
      if (latest) useTripEditDraft.getState().rebase(latest);
    },
  });
  const run = async (vars: { memberId: string; expectedVersion: number }) => {
    try {
      await mutation.mutateAsync(vars);
      return true;
    } catch (e) {
      await handleMemberActionFailure(queryClient, tripId, e, '내보내지 못했어요');
      return false;
    }
  };
  return { run, isPending: mutation.isPending };
}

/**
 * 여행 삭제 요청. 이미 삭제된 여행(404)은 실패가 아니라 삭제된 것으로 본다(FR-032).
 * 멱등키가 없어 응답만 놓치고 다시 보내면 404가 오기 때문이다
 */
export async function deleteTripOrGone(
  tripId: string,
  expectedVersion: number,
): Promise<JobRef | null> {
  try {
    return await deleteTrip(tripId, expectedVersion);
  } catch (e) {
    if (memberActionFailure(e) === 'tripGone') return null;
    throw e;
  }
}

/** 여행 삭제. 이동과 캐시 정리(exitTrip)는 부르는 쪽에서 한다 */
export function useDeleteTrip(tripId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (expectedVersion: number) => deleteTripOrGone(tripId, expectedVersion),
  });
  const run = async (expectedVersion: number) => {
    try {
      await mutation.mutateAsync(expectedVersion);
      return true;
    } catch (e) {
      await handleMemberActionFailure(queryClient, tripId, e, '여행을 삭제하지 못했어요');
      return false;
    }
  };
  return { run, isPending: mutation.isPending };
}
