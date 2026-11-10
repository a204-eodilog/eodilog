import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import type { BasisCell } from '../recommend-rules';

/**
 * S21 "이번 추천에 쓴 것"(Figma 201-10081). 숫자 칸 세 개와 비공개 정보는 쓰지 않았다는 줄.
 * 값은 추천 결과 basis와 여행 정보에서 온다(디자인 결정 S21).
 */
export function BasisCard({ cells }: { cells: readonly BasisCell[] }) {
  return (
    <View style={styles.card}>
      <Text style={[typography.label, styles.heading]}>이번 추천에 쓴 것</Text>
      <View style={styles.row}>
        {cells.map((c) => (
          <View key={c.label} style={styles.cell}>
            <Text style={styles.value} numberOfLines={1}>
              {c.value}
              {c.extra ? <Text style={styles.extra}>{` ${c.extra}`}</Text> : null}
            </Text>
            {/* 좁은 화면에서 기간이 잘리지 않게 두 줄까지 쓴다 */}
            <Text style={[typography.caption, styles.label]} numberOfLines={2}>
              {c.label}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.note}>
        <Icon name="lock" size={16} color={colors.text.icon} />
        <Text style={[typography.caption, styles.noteText]}>
          개인 즐겨찾기와 비공개 취향은 쓰지 않았어요
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing[12],
    padding: spacing[18],
    borderRadius: radius.lg,
    backgroundColor: colors.brand.primaryBg,
  },
  heading: { color: colors.brand.primaryDark },
  row: { flexDirection: 'row', gap: spacing[8] },
  cell: {
    flex: 1,
    gap: spacing[2],
    padding: spacing[12],
    borderRadius: radius.md + 2,
    backgroundColor: colors.surface.white,
  },
  value: { ...typography.title2, lineHeight: 28, color: colors.text.default },
  extra: { ...typography.caption, color: colors.brand.primary },
  label: { color: colors.text.sub2 },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  noteText: { color: colors.text.icon },
});
