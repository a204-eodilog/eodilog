import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

import { progressLabel, progressRatio } from '../checklist-rules';
import type { ChecklistItem } from '../types';

/** "6개 중 3개 챙겼어요"와 챙긴 비율만큼 찬 막대(Figma 201-15334) */
export function ChecklistProgress({ items }: { items: readonly ChecklistItem[] }) {
  const ratio = progressRatio(items);
  return (
    <View style={styles.wrap}>
      <Text style={[typography.bodyBold, styles.label]}>{progressLabel(items)}</Text>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
      >
        <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[10] },
  label: { color: colors.text.default },
  track: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: radius.full, backgroundColor: colors.brand.primary },
});
