import { Redirect } from 'expo-router';

import { ProfileScreen } from '@/features/auth/screens/profile-screen';
import { useSessionStore } from '@/stores/session-store';

/**
 * S02 프로필 만들기·수정. (auth)·(main) 묶음 밖이라 묶음의 로그인 확인이 걸리지 않아서,
 * 로그아웃하면 여기서 직접 첫 화면으로 보낸다(그러지 않으면 [로그아웃]을 눌러도 화면이 그대로다)
 */
export default function ProfileRoute() {
  const status = useSessionStore((s) => s.status);
  if (status === 'signedOut') return <Redirect href="/" />;
  return <ProfileScreen />;
}
