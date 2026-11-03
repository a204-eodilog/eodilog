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
import { ToastHost } from '@/components/ui/toast';

// 글꼴을 다 불러오기 전에는 시작 화면을 유지해 기본 글꼴이 잠깐 보이지 않게 한다
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    NotoSansKR_400Regular,
    NotoSansKR_500Medium,
    NotoSansKR_700Bold,
  });
  const ready = fontsLoaded || fontError !== null;

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
          <ToastHost />
        </BottomSheetModalProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
