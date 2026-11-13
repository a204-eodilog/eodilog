import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { celebrate } from '@/components/ui/celebrate';
import { ProgressBar } from '@/components/ui/progress-bar';
import { colors, spacing, typography } from '@/theme';

import { progressLabel, progressRatio } from '../checklist-rules';
import type { ChecklistItem } from '../types';

/** "6개 중 3개 챙겼어요"와 챙긴 비율만큼 찬 막대(Figma 201-15334) */
export function ChecklistProgress({ items }: { items: readonly ChecklistItem[] }) {
  const ratio = progressRatio(items);
  // 방금 마지막 하나를 챙겼을 때만 축하한다. 화면을 열 때 이미 다 챙겨져 있었으면 하지 않는다
  const before = useRef(ratio);
  useEffect(() => {
    if (ratio === 1 && before.current < 1) celebrate();
    before.current = ratio;
  }, [ratio]);
  return (
    <View style={styles.wrap}>
      <Text style={[typography.bodyBold, styles.label]}>{progressLabel(items)}</Text>
      <ProgressBar ratio={ratio} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[10] },
  label: { color: colors.text.default },
});
