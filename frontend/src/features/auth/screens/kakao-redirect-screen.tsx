import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

import { env } from '@/config/env';
import { colors } from '@/theme';

// 웹: 카카오 로그인 창이 이 주소로 돌아오면 창을 닫고 결과를 로그인 화면에 넘긴다
WebBrowser.maybeCompleteAuthSession();

/**
 * 카카오 로그인 뒤 돌아오는 주소(oauth/kakao). 웹은 로그인 창 안에서, 앱은 eodilog://oauth/kakao로 열린다.
 * 결과 처리는 로그인 화면이 하므로 여기서는 잠깐 기다렸다가 시작 화면으로 보낸다.
 */
export function KakaoRedirectScreen() {
  useEffect(handOffToApp, []);
  if (Platform.OS !== 'web') return <Redirect href="/" />;
  return (
    <View style={styles.screen}>
      <Spinner color={colors.brand.primary} />
    </View>
  );
}

/**
 * 개발용 앱 로그인 다리. 카카오는 eodilog:// 같은 앱 주소로 돌려보내지 않아서, 앱 개발 중에는 카카오에 등록된
 * 이 주소(http://localhost:8081/oauth/kakao, USB adb reverse로 PC 개발 서버)로 돌아온다.
 * 웹 로그인 창이면 창을 연 화면(window.opener)이 있고 위의 maybeCompleteAuthSession이 처리한다.
 * 창을 연 화면이 없는 휴대폰 브라우저면 code·state를 그대로 eodilog://oauth/kakao로 넘겨 앱이 로그인을 마치게 한다.
 * 로컬·개발 환경에서만 한다. 정식 다리는 백엔드가 https 주소로 제공해야 한다
 */
function handOffToApp() {
  if (Platform.OS !== 'web' || !['local', 'development'].includes(env.appEnv)) return;
  const w = globalThis as unknown as {
    opener?: unknown;
    navigator?: { userAgent?: string };
    location: { search: string; replace(url: string): void };
  };
  const mobileBrowser = /Android|iPhone|iPad/i.test(w.navigator?.userAgent ?? '');
  if (w.opener || !mobileBrowser || !w.location.search.includes('code=')) return;
  w.location.replace(`eodilog://oauth/kakao${w.location.search}`);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
  },
});
