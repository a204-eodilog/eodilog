import { Redirect, Stack } from 'expo-router';

import { useSessionStore } from '@/stores/session-store';

/**
 * 가입을 마친 사람만 들어온다. 아니면 시작 주소가 알맞은 화면으로 보낸다.
 * (tabs)는 하단 탭 첫 화면들, trips/* 같은 상세·입력 화면은 탭 위에 쌓여 탭이 보이지 않는다.
 */
export default function MainLayout() {
  const status = useSessionStore((s) => s.status);
  if (status !== 'signedIn') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
