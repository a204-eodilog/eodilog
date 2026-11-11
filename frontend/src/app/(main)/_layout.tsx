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
      {/*
        상세 화면은 옆에서 밀려 들어오고, 새로 만드는 입력 화면은 아래에서 올라온다(2026-11-11 사용자 결정).
        안드로이드는 전환 시간을 숫자로 바꿀 수 없고 종류마다 정해져 있다. 휴대폰에서 보고 조금 더 빠르게 해 달라고 해서
        같은 방향의 더 빠른 종류로 바꿨다: 옆에서 400ms(slide_from_right) → 200ms(ios_from_right),
        아래에서 400ms(slide_from_bottom) → 350ms(fade_from_bottom)
      */}
      <Stack screenOptions={{ headerShown: false, animation: 'ios_from_right' }}>
        <Stack.Screen name="trips/new" options={{ animation: 'fade_from_bottom' }} />
      </Stack>
      <NotificationPopupHost />
    </>
  );
}
