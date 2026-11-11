import { Redirect, Stack } from 'expo-router';

import { NotificationPopupHost } from '@/features/notification/screens/popup-host';
import { useSessionStore } from '@/stores/session-store';

/**
 * 가입을 마친 사람만 들어온다. 아니면 시작 주소가 알맞은 화면으로 보낸다.
 * (tabs)는 하단 탭 첫 화면들, trips/* 같은 상세·입력 화면은 탭 위에 쌓여 탭이 보이지 않는다.
 * 앱 실행·복귀 때 뜨는 S48 알림 팝업 자리도 여기 하나 둔다. 어느 탭에서든 뜬다.
 */
/**
 * 링크로 (main) 안의 화면(예: 여행 상세)을 바로 열 때 밑에 깔 첫 화면. withAnchor로 이동할 때만 쓰인다.
 * 그래야 링크로 연 화면에서 뒤로 가면 앱이 닫히지 않고 탭 화면으로 간다
 */
export const unstable_settings = { anchor: '(tabs)' };

export default function MainLayout() {
  const status = useSessionStore((s) => s.status);
  if (status !== 'signedIn') return <Redirect href="/" />;
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <NotificationPopupHost />
    </>
  );
}
