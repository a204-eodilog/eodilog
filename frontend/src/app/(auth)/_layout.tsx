import { Redirect, Stack } from 'expo-router';

import { useSessionStore } from '@/stores/session-store';

/** 로그인 전 화면. 가입을 마친 사람은 홈으로 보낸다 */
export default function AuthLayout() {
  const status = useSessionStore((s) => s.status);
  if (status === 'signedIn') return <Redirect href="/home" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
