import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

// 웹: 카카오 로그인 창이 이 주소로 돌아오면 창을 닫고 결과를 로그인 화면에 넘긴다
WebBrowser.maybeCompleteAuthSession();

/**
 * 카카오 로그인 뒤 돌아오는 주소(oauth/kakao). 웹은 로그인 창 안에서, 앱은 eodilog://oauth/kakao로 열린다.
 * 결과 처리는 로그인 화면이 하므로 여기서는 잠깐 기다렸다가 시작 화면으로 보낸다.
 */
export function KakaoRedirectScreen() {
  if (Platform.OS !== 'web') return <Redirect href="/" />;
  return (
    <View style={styles.screen}>
      <ActivityIndicator color={colors.brand.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
  },
});
