import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import type { ApiErrorBody } from '@/api/types';
import { toast } from '@/components/ui';
import type { InvitableFriends } from '@/features/invitation/types';

import { cancelFriendInvitation, getInvitableFriends, sendFriendInvitations } from '../api';
import { sendResultMessage } from '../friend-invite-rules';

import { tripKey } from './use-trip';

export const invitableFriendsKey = (tripId: string) =>
  [...tripKey(tripId), 'invitable-friends'] as const;

/** S18 앱 내 친구 초대. 맞팔 친구 목록과 상태(초대 가능·초대함·참여 중)는 서버가 정한다 */
export function useInvitableFriends(tripId: string) {
  return useQuery({
    queryKey: invitableFriendsKey(tripId),
    queryFn: ({ signal }) => getInvitableFriends(tripId, signal),
    enabled: !!tripId,
  });
}

function isTripFull(error: unknown) {
  return (
    isAxiosError<ApiErrorBody>(error) &&
    error.response?.status === 409 &&
    error.response.data?.error?.code === 'TRIP_FULL'
  );
}

/** 보내기·취소. 보내기 결과는 사람마다 달라 낙관적으로 바꾸지 않고 끝나면 다시 받는다 */
export function useFriendInviteActions(tripId: string) {
  const queryClient = useQueryClient();
  const key = invitableFriendsKey(tripId);

  const send = useMutation({
    mutationFn: (userIds: string[]) => sendFriendInvitations(tripId, userIds),
    onSuccess: (res) => toast.success(sendResultMessage(res.results)),
    onError: (error) =>
      toast.error(isTripFull(error) ? '여행 인원이 가득 찼어요' : '초대를 보내지 못했어요'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const cancel = useMutation({
    mutationFn: (invitationId: string) => cancelFriendInvitation(tripId, invitationId),
    onMutate: async (invitationId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<InvitableFriends>(key);
      if (before) {
        queryClient.setQueryData<InvitableFriends>(key, {
          ...before,
          friends: before.friends.map((f) =>
            f.invitationId === invitationId ? { ...f, state: 'INVITABLE', invitationId: null } : f,
          ),
        });
      }
      return { before };
    },
    onSuccess: () => toast.success('초대를 취소했어요'),
    onError: (_error, _id, context) => {
      if (context?.before) queryClient.setQueryData(key, context.before);
      toast.error('초대를 취소하지 못했어요');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { send, cancel };
}
