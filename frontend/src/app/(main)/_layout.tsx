import { Redirect, Stack } from 'expo-router';

import { useSessionStore } from '@/stores/session-store';

// 탭 구성은 사용자 흐름 EODI-46, 화면 목록 EODI-47 확정 후 Tabs로 바꾼다.
/** 가입을 마친 사람만 들어온다. 아니면 시작 주소가 알맞은 화면으로 보낸다 */
export default function MainLayout() {
  const status = useSessionStore((s) => s.status);
  if (status !== 'signedIn') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
