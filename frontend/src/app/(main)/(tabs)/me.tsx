import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui';
import { colors } from '@/theme';

/** S37 마이페이지 자리. S37이 들어오기 전까지 S45 설정(로그아웃 포함)으로 가는 길만 둔다 */
export default function MeTab() {
  return (
    <SafeAreaView style={styles.screen}>
      <EmptyState
        title="마이페이지 화면은 준비 중이에요"
        description="로그아웃과 설정은 설정 화면에서 할 수 있어요"
        actionLabel="설정"
        onAction={() => router.push('/settings')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
});
