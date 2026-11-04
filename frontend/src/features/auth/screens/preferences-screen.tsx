import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Header } from '@/components/ui';
import { colors, layout, spacing, typography } from '@/theme';

/**
 * S03 취향 입력 자리. 가입을 마친 뒤 온다(가입 완료 상태라 (main) 안에 둔다). 취향 저장 API가 아직 없어 다음 작업에서 채운다.
 * 규칙상 건너뛰기 버튼은 없지만, 자리 화면이라 홈으로 가는 버튼만 둔다.
 */
export function PreferencesScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <Header title="취향 입력" hideBack />
      <View style={styles.body}>
        <Text style={[typography.body, styles.text]}>
          좋아하는 여행 취향을 고르는 화면이에요. 다음 작업에서 만들어요.
        </Text>
        <Button label="홈으로" onPress={() => router.replace('/home')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  body: { padding: layout.screenPaddingX, gap: spacing[16] },
  text: { color: colors.text.sub },
});
