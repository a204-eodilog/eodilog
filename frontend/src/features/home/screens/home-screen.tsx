import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { signOut } from '@/features/auth/logout';
import { colors, layout, spacing, typography } from '@/theme';

/** S05 홈 자리. 지도와 탭은 지도 공통 부품 작업 뒤 채운다 */
export function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={[typography.title2, styles.title]}>홈</Text>
        <Text style={[typography.body, styles.text]}>
          로그인했어요. 친구 여행 지도는 다음 작업에서 만들어요.
        </Text>
        {/* Button은 기본이 왼쪽 정렬(alignSelf flex-start)이라 가운데에 두려면 직접 정한다 */}
        <Button label="로그아웃" variant="neutral" onPress={signOut} style={styles.logout} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
  },
  title: { color: colors.text.default },
  text: { color: colors.text.sub, textAlign: 'center' },
  logout: { alignSelf: 'center' },
});
