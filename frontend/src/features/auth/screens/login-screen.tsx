import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, toast } from '@/components/ui';
import { useSessionStore } from '@/stores/session-store';
import { colors, layout, spacing, typography } from '@/theme';

import { afterLoginHref } from '../after-login';
import { CamperVanIntro } from '../components/camper-van-intro';
import { KakaoSymbol } from '../components/kakao-symbol';
import { KakaoLoginError, loginWithKakao, prepareKakaoLogin } from '../kakao-login';

const BUTTON_HEIGHT = 54;
const BUTTON_RADIUS = 14;

function errorMessage(error: unknown): string {
  if (error instanceof KakaoLoginError) {
    if (error.reason === 'denied') return '카카오 동의를 취소했어요. 다시 시도해 주세요';
    if (error.reason === 'config') return '앱 로그인 주소가 설정되지 않았어요';
  }
  return '로그인하지 못했어요. 다시 시도해 주세요';
}

/** S01 로그인. 기본 / 실패 상태. 로그인 만료 창은 앱 시작 레이아웃에서 띄운다 */
export function LoginScreen() {
  const setSession = useSessionStore((s) => s.setSession);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 실패는 버튼을 누를 때 다시 알린다
    prepareKakaoLogin().catch(() => undefined);
  }, []);

  const onKakao = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await loginWithKakao();
      if (result.type === 'cancel') return;
      await setSession(result.session);
      router.replace(
        afterLoginHref({
          profileCompleted: result.session.user.profileCompleted,
          isNewUser: result.session.isNewUser,
          inviteToken: useSessionStore.getState().pendingInviteToken,
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
      prepareKakaoLogin().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        <View style={styles.van}>
          <CamperVanIntro />
        </View>
        <Text style={[typography.title1, styles.title]}>
          {'어디로 떠날지,\n친구 여행에서 찾아봐요'}
        </Text>
        <Text style={[typography.body, styles.subtitle]}>
          지도에서 발견하고, 동행과 함께 계획해요
        </Text>
      </View>

      <View style={styles.bottom}>
        <Text style={[typography.captionMedium, styles.sub]}>간편하게 시작하기</Text>
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="카카오로 계속하기"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={onKakao}
            style={({ pressed }) => [styles.button, styles.kakao, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator color={colors.text.default} />
            ) : (
              <>
                <KakaoSymbol />
                <Text style={[typography.bodyMedium, styles.kakaoLabel]}>카카오로 계속하기</Text>
              </>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="네이버로 계속하기"
            disabled={busy}
            onPress={() => toast.show('네이버 로그인은 준비 중이에요')}
            style={({ pressed }) => [styles.button, styles.naver, pressed && styles.pressed]}
          >
            <Text style={[typography.bodyBold, styles.naverLabel]}>N</Text>
            <Text style={[typography.bodyMedium, styles.naverLabel]}>네이버로 계속하기</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.error} accessibilityLiveRegion="polite">
            <Icon name="alert" size={16} color={colors.status.danger} />
            <Text style={[typography.captionMedium, styles.errorText]}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.terms}>
          {['이용약관', '개인정보 처리방침'].map((label) => (
            <Pressable
              key={label}
              accessibilityRole="link"
              onPress={() => toast.show(`${label} 화면은 준비 중이에요`)}
              style={styles.termLink}
            >
              <Text style={[typography.captionMedium, styles.sub]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPaddingX,
  },
  van: { width: 200, height: 140, marginBottom: spacing[24] },
  title: { color: colors.text.default, textAlign: 'center', letterSpacing: -0.5 },
  subtitle: { color: colors.text.icon, textAlign: 'center', marginTop: spacing[8] },
  bottom: {
    alignItems: 'center',
    gap: spacing[16],
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: spacing[24],
  },
  sub: { color: colors.text.sub },
  buttons: { alignSelf: 'stretch', gap: spacing[16], marginTop: spacing[8] },
  button: {
    height: BUTTON_HEIGHT,
    borderRadius: BUTTON_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[10],
  },
  pressed: { opacity: 0.85 },
  kakao: { backgroundColor: colors.external.kakao },
  kakaoLabel: { color: colors.text.default },
  naver: { backgroundColor: colors.external.naver },
  naverLabel: { color: colors.text.inverse },
  error: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  errorText: { color: colors.status.danger },
  terms: { flexDirection: 'row', gap: spacing[20], marginTop: spacing[8] },
  termLink: { paddingHorizontal: spacing[4], paddingVertical: spacing[12] },
});
