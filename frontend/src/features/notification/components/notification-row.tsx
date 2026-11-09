import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import type { NotificationLine } from '../notification-rules';

type Props = {
  line: NotificationLine;
  onPress: () => void;
  /** S48 팝업 줄처럼 작은 모양 */
  compact?: boolean;
};

/**
 * 알림 한 줄(Figma S49 201-25939). 안 읽은 알림은 아이콘 바탕이 파랗고 제목이 굵으며 오른쪽에 파란 점.
 * 나간 여행이면 시각 뒤에 '나간 여행' 표시
 */
export function NotificationRow({ line, onPress, compact = false }: Props) {
  const state = line.unread ? '읽지 않음, ' : '';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${state}${line.title}, ${line.label}, ${line.time}${line.leftTrip ? ', 나간 여행' : ''}`}
      style={({ pressed }) => [styles.row, compact && styles.compact, pressed && styles.pressed]}
    >
      <View style={[styles.icon, compact && styles.iconCompact, line.unread && styles.iconUnread]}>
        <Icon
          name={line.icon}
          size={compact ? 16 : 18}
          color={line.unread ? colors.brand.primary : colors.text.icon}
        />
      </View>
      <View style={styles.body}>
        <Text
          style={[
            compact ? typography.captionBold : line.unread ? typography.bodyBold : typography.body,
            styles.title,
          ]}
          numberOfLines={compact ? 1 : 2}
        >
          {line.title}
        </Text>
        <View style={styles.meta}>
          <Text style={[compact ? typography.micro : typography.caption, styles.metaText]}>
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[14], minHeight: 60 },
  compact: { gap: spacing[12], minHeight: 44 },
  pressed: { opacity: 0.6 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCompact: { width: 28, height: 28, borderRadius: 14 },
  iconUnread: { backgroundColor: colors.brand.primaryBg },
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
