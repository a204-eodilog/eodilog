import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui';
import { colors } from '@/theme';

/** S10 저장 탭 자리. 저장 명세(B)에서 채운다 */
export default function SavedTab() {
  return (
    <SafeAreaView style={styles.screen}>
      <EmptyState title="저장 화면은 준비 중이에요" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
});
