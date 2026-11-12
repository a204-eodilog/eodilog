import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';

import { PressableScale } from '@/components/ui/pressable-scale';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSessionStore } from '@/stores/session-store';
import { colors, layout, spacing, typography } from '@/theme';

import { AppLogo } from '../components/app-logo';

/** 로고가 나타난 뒤 로그인으로 넘어가기까지 */
const HOLD_MS = 1800;

/**
 * S00 랜딩. 처음 실행할 때 한 번만 보여 준다. 로고와 한 줄 소개가 떠오른 뒤 S01 로그인으로 간다.
 * 기다리기 싫으면 화면을 눌러 바로 넘어간다. 시스템 '움직임 줄이기'는 Reanimated가 알아서 따른다.
 */
export function LandingScreen() {
  const markLandingSeen = useSessionStore((s) => s.markLandingSeen);

  const next = () => {
    markLandingSeen();
    router.replace('/login');
  };

  useEffect(() => {
    const timer = setTimeout(next, HOLD_MS);
    return () => clearTimeout(timer);
    // 처음 그릴 때 한 번만 예약한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="시작하기"
        onPress={next}
        style={styles.body}
      >
        <Animated.View entering={FadeInDown.duration(600)}>
          <AppLogo size={96} />
        </Animated.View>
        <Animated.View entering={FadeIn.delay(300).duration(500)} style={styles.copy}>
          <Text style={[typography.title1, styles.title]}>어디로그</Text>
          <Text style={[typography.body, styles.tagline]}>친구의 여행에서 다음 여행을 찾아요</Text>
        </Animated.View>
      </PressableScale>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[24],
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 64,
  },
  copy: { alignItems: 'center', gap: spacing[8] },
  title: { color: colors.text.default, letterSpacing: -0.5 },
  tagline: { color: colors.text.icon, letterSpacing: -0.1 },
});
