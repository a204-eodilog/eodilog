import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui';
import { colors } from '@/theme';

/** S46 대화방 목록 자리. 채팅 명세에서 채운다 */
export default function ChatsTab() {
  return (
    <SafeAreaView style={styles.screen}>
      <EmptyState title="채팅 화면은 준비 중이에요" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
});
