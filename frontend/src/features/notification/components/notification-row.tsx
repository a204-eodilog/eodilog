import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

import type { NotificationLine } from '../notification-rules';

type Props = {
  line: NotificationLine;
  onPress: () => void;
  /** S48 팝업 줄. 제목 한 줄, 종류와 시각을 한 줄에 */
  compact?: boolean;
};

/**
 * 알림 한 줄(Figma S49 201-25939). 안 읽은 알림은 아이콘 바탕이 파랗고 제목이 굵으며 오른쪽에 파란 점.
 * 나간 여행이면 시각 뒤에 '나간 여행' 표시
 */
export function NotificationRow({ line, onPress, compact = false }: Props) {
  const state = line.unread ? '읽지 않음, ' : '';
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${state}${line.title}, ${line.label}, ${line.time}${line.leftTrip ? ', 나간 여행' : ''}`}
      style={({ pressed }) => [
        styles.row,
        compact && styles.compact,
        !compact && line.unread && styles.rowUnread,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.icon, line.unread && styles.iconUnread]}>
        <Icon
          name={line.icon}
          size={18}
          color={line.unread ? colors.text.default : colors.text.icon}
        />
      </View>
      <View style={styles.body}>
        <Text
          style={[line.unread ? typography.bodyBold : typography.body, styles.title]}
          // 팝업에서도 두 줄까지 보인다. 한 줄이면 제목 끝이 잘렸다
          numberOfLines={2}
        >
          {line.title}
        </Text>
        <View style={styles.meta}>
          <Text style={[typography.caption, styles.metaText]}>
            {compact ? `${line.label} · ${line.time}` : line.label}
          </Text>
          {compact ? null : <Text style={[typography.caption, styles.metaText]}>{line.time}</Text>}
          {line.leftTrip ? (
            <View style={styles.left}>
              <Icon name="leave" size={14} color={colors.text.icon} />
              <Text style={[typography.captionMedium, styles.metaText]}>나간 여행</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={[styles.dot, line.unread && styles.dotOn]} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // 한 줄 제목이면 높이 60 그대로다(26 + 2 + 20 + 위아래 6). 제목이 두 줄이면 위아래 6이 남아 옆 줄과 붙지 않는다
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    minHeight: 64,
    paddingVertical: spacing[10],
    paddingHorizontal: spacing[12],
    borderRadius: radius.lg,
  },
  // 읽지 않은 알림은 줄 전체가 연파랑 카드가 된다. 점 하나보다 한눈에 구분된다
  rowUnread: { backgroundColor: colors.brand.primaryBg },
  // Figma S48 팝업 줄은 높이 52, 종류와 시각을 한 줄에
  compact: { minHeight: 52, paddingVertical: spacing[4], paddingHorizontal: 0 },
  pressed: { opacity: 0.6 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: colors.surface.white },
  body: { flex: 1, gap: spacing[2] },
  title: { color: colors.text.default },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  metaText: { color: colors.text.icon },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    height: 24,
    paddingHorizontal: spacing[8],
    borderRadius: radius.sm,
    backgroundColor: colors.surface.default,
  },
  dot: { width: 8, height: 8, borderRadius: radius.xs },
  dotOn: { backgroundColor: colors.brand.primary },
});
