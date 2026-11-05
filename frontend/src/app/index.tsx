import { Redirect } from 'expo-router';

import { useSessionStore } from '@/stores/session-store';

/** 시작 주소. 로그인 상태에 맞는 첫 화면으로 보낸다. 처음 실행이면 S00 랜딩을 먼저 보여 준다 */
export default function Index() {
  const status = useSessionStore((s) => s.status);
  const landingSeen = useSessionStore((s) => s.landingSeen);
  if (status === 'loading') return null;
  if (status === 'signedOut') return <Redirect href={landingSeen ? '/login' : '/landing'} />;
  if (status === 'pending') return <Redirect href="/profile" />;
  return <Redirect href="/home" />;
}
