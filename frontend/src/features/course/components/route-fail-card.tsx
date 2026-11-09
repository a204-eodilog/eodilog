import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  /** "10.26(월) 21:10 기준". 구한 적이 없으면 null */
  basis: string | null;
  onRecalculate(): void;
  busy: boolean;
};

/** S24 이동 시간 갱신 실패 카드(Figma 201-29705). 0분이나 직선거리로 채우지 않고 지난 기준을 보인다 */
export function RouteFailCard({ basis, onRecalculate, busy }: Props) {
  return (
    <View style={styles.card} accessibilityRole="alert">
      <View style={styles.top}>
        <View style={styles.badge}>
          <Icon name="clock" size={22} color={colors.text.icon} />
        </View>
        <View style={styles.texts}>
          <Text style={[typography.bodyBold, styles.title]}>이동 시간을 새로 구하지 못했어요</Text>
          <Text style={[typography.caption, styles.body]}>지난번 계산 기준이에요</Text>
          {basis ? (
            <View style={styles.basis}>
              <Icon name="clock" size={14} color={colors.text.icon} />
              <Text style={[typography.caption, styles.body]}>{basis}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.actionRow}>
        <Pressable
          style={styles.action}
          onPress={onRecalculate}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.text.icon} />
          ) : (
            <Icon name="refresh" size={16} color={colors.text.default} />
          )}
          <Text style={[typography.bodyMedium, styles.actionText]}>
            {busy ? '계산하는 중…' : '다시 계산'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface.default,
    borderRadius: radius.xl,
    padding: spacing[18],
    gap: spacing[10],
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[14] },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: spacing[2] },
  title: { color: colors.text.default },
  body: { color: colors.text.icon },
  basis: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    height: 36,
    paddingLeft: spacing[12],
    paddingRight: spacing[16],
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
  },
  actionText: { color: colors.text.default },
});
