import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidateAfterJoin } from '@/features/trip/hooks/trip-cache';
import { tripKey } from '@/features/trip/hooks/use-trip';

import {
  acceptTripInvitation,
  declineTripInvitation,
  getReceivedTripInvitation,
  getReceivedTripInvitations,
} from '../api';
import type { ReceivedTripInvitation } from '../types';

export const receivedInvitationsKey = ['me', 'trip-invitations'] as const;
export const receivedInvitationKey = (id: string) => [...receivedInvitationsKey, id] as const;

/** 받은 앱 내 여행 초대 중 지금 수락할 수 있는 것 */
export function useReceivedInvitations() {
  return useQuery({
    queryKey: receivedInvitationsKey,
    queryFn: ({ signal }) => getReceivedTripInvitations(signal),
  });
}

export function useReceivedInvitation(id: string) {
  return useQuery({
    queryKey: receivedInvitationKey(id),
    queryFn: ({ signal }) => getReceivedTripInvitation(id, signal),
    enabled: !!id,
    retry: false,
  });
}

/** 수락·거절. 수락하면 여행·여행 목록·채팅 목록을 새로 받는다 */
export function useAnswerInvitation() {
  const queryClient = useQueryClient();

  const accept = useMutation({
    mutationFn: (id: string) => acceptTripInvitation(id),
    onSuccess: (trip, id) => {
      void queryClient.invalidateQueries({ queryKey: tripKey(trip.id) });
      void invalidateAfterJoin(queryClient);
      void queryClient.invalidateQueries({ queryKey: receivedInvitationsKey });
      void queryClient.invalidateQueries({ queryKey: receivedInvitationKey(id) });
    },
  });

  const decline = useMutation({
    mutationFn: (id: string) => declineTripInvitation(id),
    onSuccess: (_res, id) => {
      queryClient.setQueryData<ReceivedTripInvitation[]>(receivedInvitationsKey, (list) =>
        list?.filter((i) => i.id !== id),
      );
      void queryClient.invalidateQueries({ queryKey: receivedInvitationsKey });
    },
  });

  return { accept, decline };
}
