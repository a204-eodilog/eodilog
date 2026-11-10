import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Icon, type IconName } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * 서버가 장소 빼기 변경안을 아직 받지 않을 때. 다시 시도해도 같으므로 코스 편집에서 직접 빼도록 안내한다
 * (가정 — 사용자 확인 필요, Q-11-6)
 */
export function ProposalUnsupported({ onEdit, onCourse }: { onEdit(): void; onCourse(): void }) {
  return (
    <View style={styles.center}>
      <View style={styles.badge}>
        <Icon name="info" size={28} color={colors.text.icon} />
      </View>
      <Text style={[typography.title2, styles.title]}>아직 AI로 장소를 뺄 수 없어요</Text>
      <Button
        label="코스 편집"
        weight="medium"
        leading={<Icon name="pencil" size={18} color={colors.text.inverse} />}
        onPress={onEdit}
        style={styles.retry}
      />
      <Pressable style={styles.course} onPress={onCourse} accessibilityRole="button">
        <Icon name="route" size={18} color={colors.text.icon} />
        <Text style={[typography.bodyMedium, styles.body]}>코스 보기</Text>
      </Pressable>
    </View>
  );
}

/**
 * S29 재계산 실패(Figma 201-16329). 변경안 작업이 실패하거나 4분을 넘겼다.
 * 설명 없이 아이콘과 짧은 제목, [다시 시도], [코스 보기].
 */
export function ProposalFail({
  onRetry,
  onCourse,
  title = '동선을 다시 짜지 못했어요',
  icon = 'alert',
}: {
  onRetry(): void;
  onCourse(): void;
  /** 지금 코스를 받지 못한 경우처럼 까닭이 다르면 바꿔 넘긴다 */
  title?: string;
  icon?: IconName;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.badge}>
        <Icon name={icon} size={28} color={colors.text.icon} />
      </View>
      <Text style={[typography.title2, styles.title]}>{title}</Text>
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
