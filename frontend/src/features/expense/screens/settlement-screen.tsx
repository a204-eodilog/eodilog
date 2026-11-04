import { StyleSheet, Text, View } from 'react-native';

import { Header } from '@/components/ui';
import { colors, layout, typography } from '@/theme';

/**
 * S36 정산 결과 자리. S35 [정산 계산]·[이전 정산 보기]가 여기로 온다.
 * 계산(POST /settlements)과 결과·재계산 필요·계산 실패 상태는 다음 작업(S36)에서 채운다.
 */
export function SettlementScreen() {
  return (
    <View style={styles.screen}>
      <Header title="정산" />
      <Text style={[typography.body, styles.text]}>
        누가 누구에게 얼마 보낼지 보여 주는 화면이에요. 다음 작업에서 만들어요.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  text: { color: colors.text.sub, padding: layout.screenPaddingX },
});
