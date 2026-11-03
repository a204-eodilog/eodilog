import { router } from 'expo-router';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { useSessionStore } from '@/stores/session-store';
import { colors, layout, radius, spacing, typography } from '@/theme';

/**
 * S01 로그인 만료. 토큰 갱신에 실패하면 보던 화면 위에 뜬다.
 * 앱 시작 레이아웃에 한 번만 둔다.
 */
export function SessionExpiredDialog() {
  const expired = useSessionStore((s) => s.expired);
  const dismissExpired = useSessionStore((s) => s.dismissExpired);

  const goLogin = () => {
    dismissExpired();
    router.replace('/login');
  };

  return (
    <Modal visible={expired} transparent animationType="fade" onRequestClose={goLogin}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert">
          <Text style={[typography.title2, styles.title]}>다시 로그인해 주세요</Text>
          <Text style={[typography.body, styles.body]}>
            로그인한 지 오래돼서 다시 확인이 필요해요
          </Text>
          <View style={styles.actions}>
            <Button label="로그인하기" onPress={goLogin} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPaddingX,
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface.white,
    borderRadius: radius.xxl,
    padding: spacing[20],
    gap: spacing[12],
  },
  title: { color: colors.text.default },
  body: { color: colors.text.sub },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: spacing[12] },
});
