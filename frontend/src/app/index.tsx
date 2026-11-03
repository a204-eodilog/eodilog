import { Redirect } from 'expo-router';

import { useSessionStore } from '@/stores/session-store';

/** 시작 주소. 로그인 상태에 맞는 첫 화면으로 보낸다 */
export default function Index() {
  const status = useSessionStore((s) => s.status);
  if (status === 'loading') return null;
  if (status === 'signedOut') return <Redirect href="/login" />;
  if (status === 'pending') return <Redirect href="/profile" />;
  return <Redirect href="/home" />;
}
