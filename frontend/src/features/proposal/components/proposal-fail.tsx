import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * S29 재계산 실패(Figma 201-16329). 변경안 작업이 실패하거나 2분을 넘겼다.
 * 지금 코스는 그대로라고 알리고 [다시 시도], [코스 보기].
 */
export function ProposalFail({ onRetry, onCourse }: { onRetry(): void; onCourse(): void }) {
  return (
    <View style={styles.center}>
      <View style={styles.badge}>
        <Icon name="cloud-off" size={28} color={colors.text.icon} />
      </View>
      <Text style={[typography.title2, styles.title]}>동선을 다시 짜지 못했어요</Text>
      <Text style={[typography.body, styles.body]}>
        {'이동 시간을 구하지 못했어요\n지금 코스는 그대로예요'}
      </Text>
      <Button
        label="다시 시도"
        weight="medium"
        leading={<Icon name="refresh" size={18} color={colors.text.inverse} />}
        onPress={onRetry}
        style={styles.retry}
      />
      <Pressable style={styles.course} onPress={onCourse} accessibilityRole="button">
        <Icon name="route" size={18} color={colors.text.icon} />
        <Text style={[typography.bodyMedium, styles.body]}>코스 보기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[32],
    paddingBottom: 80,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text.default, marginTop: spacing[20], textAlign: 'center' },
  body: { color: colors.text.icon, marginTop: spacing[6], textAlign: 'center' },
  retry: { alignSelf: 'center', marginTop: spacing[24] },
  course: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    minHeight: 48,
    paddingHorizontal: spacing[16],
    marginTop: spacing[8],
  },
});
