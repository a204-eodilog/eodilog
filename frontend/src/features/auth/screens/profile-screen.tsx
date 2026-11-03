import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Header } from '@/components/ui';
import { colors, layout, spacing, typography } from '@/theme';

import { signOut } from '../logout';

/**
 * S02 프로필·연령 입력 자리. 가입 대기(닉네임 없음) 사용자가 로그인하면 여기로 온다.
 * 닉네임 입력은 다음 작업(S02)에서 채운다.
 */
export function ProfileScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <Header title="프로필" hideBack />
      <View style={styles.body}>
        <Text style={[typography.body, styles.text]}>
          닉네임을 정하면 가입이 끝나요. 입력 화면은 다음 작업에서 만들어요.
        </Text>
        <Button label="로그아웃" variant="neutral" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  body: { padding: layout.screenPaddingX, gap: spacing[16] },
  text: { color: colors.text.sub },
});
