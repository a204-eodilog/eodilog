import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { InviteScreen } from '@/features/invitation/screens/invite-screen';
import { useSessionStore } from '@/stores/session-store';

/**
 * 초대 링크 주소(eodilog://invitations/{token}).
 * 로그인 전이면 토큰을 기억해 두고 S01 로그인으로, 가입 대기면 S02 프로필로 보낸다. 마치면 다시 여기로 온다
 */
export default function InvitationRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const status = useSessionStore((s) => s.status);
  const setPendingInvite = useSessionStore((s) => s.setPendingInvite);

  useEffect(() => {
    if (token && (status === 'signedOut' || status === 'pending')) setPendingInvite(token);
  }, [token, status, setPendingInvite]);

  if (status === 'loading') return null;
  if (status === 'signedOut') return <Redirect href="/login" />;
  if (status === 'pending') return <Redirect href="/profile" />;
  return <InviteScreen />;
}
