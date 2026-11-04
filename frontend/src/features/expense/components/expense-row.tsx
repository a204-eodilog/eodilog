import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Icon, Tag } from '@/components/ui';
import { formatWon } from '@/lib/format-number';
import { colors, spacing, typography } from '@/theme';

type ExpenseRowProps = {
  title: string;
  amount: number;
  payerName: string;
  payerIsMe: boolean;
  /** "지우가 냄" */
  payerText: string;
  /** "3명 똑같이", "서연, 지우 2명" */
  splitText: string;
  /** 정산을 계산한 뒤에 들어온 지출 */
  addedAfterSettlement?: boolean;
  onPress: () => void;
};

/** S35 지출 한 줄. 낸 사람 얼굴 · 이름과 누가 냈는지·나눈 사람 · 금액 */
export function ExpenseRow({
  title,
  amount,
  payerName,
  payerIsMe,
  payerText,
  splitText,
  addedAfterSettlement = false,
  onPress,
}: ExpenseRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} ${formatWon(amount)}, ${payerText}, ${splitText}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar name={payerName} me={payerIsMe} size={36} />
      <View style={styles.texts}>
        <View style={styles.titleRow}>
          <Text style={[typography.bodyBold, styles.title]} numberOfLines={1}>
            {title}
          </Text>
          {addedAfterSettlement ? <Tag label="정산 후 추가" tone="brand" small /> : null}
        </View>
        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Icon name="card" size={16} color={colors.text.icon} />
            <Text style={[typography.caption, styles.metaText]} numberOfLines={1}>
              {payerText}
            </Text>
          </View>
          <View style={[styles.metaItem, styles.shrink]}>
            <Icon name="people" size={16} color={colors.text.icon} />
            <Text style={[typography.caption, styles.metaText, styles.shrink]} numberOfLines={1}>
              {splitText}
            </Text>
          </View>
        </View>
      </View>
      <Text style={[typography.bodyBold, styles.amount]}>{formatWon(amount)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: spacing[18] },
  pressed: { opacity: 0.7 },
  texts: { flex: 1, gap: spacing[2] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  title: { color: colors.text.default, flexShrink: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  metaText: { color: colors.text.icon },
  shrink: { flexShrink: 1 },
  amount: { color: colors.text.default, textAlign: 'right' },
});
