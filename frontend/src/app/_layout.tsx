import {
  NotoSansKR_400Regular,
  NotoSansKR_500Medium,
  NotoSansKR_700Bold,
  useFonts,
} from '@expo-google-fonts/noto-sans-kr';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { queryClient } from '@/api/query-client';
import { setupQueryFocus } from '@/api/query-focus';
import { CelebrateHost } from '@/components/ui/celebrate';
import { ToastHost } from '@/components/ui/toast';
import { SessionExpiredDialog } from '@/features/auth/components/session-expired-dialog';
import { startChatRealtime } from '@/features/chat/realtime-chat';
import { useRealtimeLifecycle } from '@/realtime';
import { useSessionStore } from '@/stores/session-store';

// 글꼴과 저장된 로그인을 다 불러오기 전에는 시작 화면을 유지한다
SplashScreen.preventAutoHideAsync();

// 앱 복귀·연결 복구 때 서버 데이터를 다시 받게 한다
setupQueryFocus();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    NotoSansKR_400Regular,
    NotoSansKR_500Medium,
    NotoSansKR_700Bold,
  });
  const sessionLoaded = useSessionStore((s) => s.status !== 'loading');
  const ready = (fontsLoaded || fontError !== null) && sessionLoaded;

  // 로그인한 동안 실시간 연결(채팅 등)을 켜고, 앱이 백그라운드면 끊는다
  useRealtimeLifecycle();

  // 채팅 큐 구독. src/realtime은 기능을 모르므로 앱 층에서 붙인다(채팅 명세 contracts/realtime.md "모듈 경계")
  const signedIn = useSessionStore((s) => s.status === 'signedIn');
  useEffect(() => (signedIn ? startChatRealtime(queryClient) : undefined), [signedIn]);

  useEffect(() => {
    useSessionStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    // 바텀시트(끌어서 닫기)와 토스트(밀어서 지우기)는 제스처 루트 안에 있어야 동작한다
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <BottomSheetModalProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <SessionExpiredDialog />
          <ToastHost />
          <CelebrateHost />
        </BottomSheetModalProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
