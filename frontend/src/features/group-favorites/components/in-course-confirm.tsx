import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  visible: boolean;
  onRemoveAnyway(): void;
  onRefresh(): void;
};

/**
 * S20 코스에 있는 장소 빼기 확인(Figma 201-29151).
 * 서버는 내 저장만 지우고 코스는 그대로 두므로 설명을 "빼도 코스에는 그대로 남아요"로 바꿨다(가정 Q-7-4).
 * Figma 제목은 "○○님이 이 장소를 코스에 넣었어요"지만, 서버가 주는 것은 코스를 마지막으로 고친 동행이라
 * 그 장소를 넣은 사람이 아닐 수 있다. 그래서 이름 없이 알린다(가정 — 사용자 확인 필요, Q-7-6)
 */
export function InCourseConfirm({ visible, onRemoveAnyway, onRefresh }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRefresh}>
      <View style={styles.dim}>
        <View style={styles.card} accessibilityRole="alert">
          <Text style={[typography.title2, styles.title]}>코스에 들어 있는 장소예요</Text>
          <Text style={[typography.body, styles.body]}>
            이 장소가 코스에 있어요.{'\n'}빼도 코스에는 그대로 남아요
          </Text>
          <View style={styles.actions}>
            <Pressable style={styles.ghost} onPress={onRemoveAnyway} accessibilityRole="button">
              <Text style={[typography.bodyMedium, styles.ghostText]}>그래도 빼기</Text>
            </Pressable>
            <Pressable style={styles.primary} onPress={onRefresh} accessibilityRole="button">
              <Text style={[typography.bodyBold, styles.primaryText]}>최신 목록 보기</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[24],
  },
  card: {
    alignSelf: 'stretch',
    padding: spacing[24],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.white,
    gap: spacing[12],
  },
  title: { color: colors.text.default },
  body: { color: colors.text.icon },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing[8],
    marginTop: spacing[8],
  },
  ghost: { minHeight: 48, paddingHorizontal: spacing[16], justifyContent: 'center' },
  ghostText: { color: colors.text.icon },
  primary: {
    minHeight: 48,
    paddingHorizontal: spacing[20],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    justifyContent: 'center',
  },
  primaryText: { color: colors.text.inverse },
});
