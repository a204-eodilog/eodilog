import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useMe } from '@/hooks/use-me';

import { cancelInvitations, createInvitation } from '../api';
import { memberActionFailure } from '../companion-rules';
import { appInviteLink, toAppInviteLink } from '../invite-link';
import { forgetInviteLink, readInviteLink, saveInviteLink } from '../invite-storage';
import type { SavedInviteLink } from '../types';

import { tripKey } from './use-trip';

export const inviteLinkKey = (tripId: string) => [...tripKey(tripId), 'invite'] as const;

/**
 * S18 초대 링크. 이 기기에서 만든 링크를 만료 전까지 보여 준다(research R1).
 * 화면에 들어올 때 서버를 부르지 않는다. 사용자가 누를 때만 만들고(FR-002), 취소한다(FR-007).
 * 앱이 다시 앞으로 오면 저장소를 다시 읽어 만료를 반영한다.
 */
export function useInviteLink(tripId: string) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const userId = me?.id;

  const link = useQuery({
    queryKey: inviteLinkKey(tripId),
    queryFn: async () => {
      const saved = userId ? await readInviteLink(userId, tripId) : null;
      // 예전에 서버 주소 그대로 저장한 링크도 이 앱이 받는 주소로 바꿔 보인다
      return saved ? { ...saved, url: toAppInviteLink(saved.url) } : null;
    },
    enabled: !!userId,
    staleTime: 0,
  });

  // 여행에서 빠졌으면(404) 남겨 둔 링크도 지운다(FR-033)
  const forgetIfGone = (error: unknown) => {
    if (memberActionFailure(error) !== 'tripGone') return;
    forgetInviteLink(tripId).catch(() => undefined);
    queryClient.setQueryData(inviteLinkKey(tripId), null);
  };

  const create = useMutation({
    mutationFn: async (): Promise<SavedInviteLink> => {
      const secret = await createInvitation(tripId);
      // 서버가 주는 url은 예전 앱 이름으로 시작해 눌러도 앱이 열리지 않는다. 토큰으로 앱 주소를 만든다
      const saved = { url: appInviteLink(secret.token), expiresAt: secret.expiresAt };
      // 저장에 실패해도 이번 화면에서는 링크를 보여 준다. 다시 들어오면 없어진다
      if (userId) await saveInviteLink(userId, tripId, saved).catch(() => undefined);
      return saved;
    },
    onSuccess: (saved) => queryClient.setQueryData(inviteLinkKey(tripId), saved),
    onError: forgetIfGone,
  });

  const cancel = useMutation({
    mutationFn: async () => {
      await cancelInvitations(tripId);
      await forgetInviteLink(tripId).catch(() => undefined);
    },
    onSuccess: () => queryClient.setQueryData(inviteLinkKey(tripId), null),
    onError: forgetIfGone,
  });

  return { link: link.data ?? null, isLoading: link.isPending && !!userId, create, cancel };
}
