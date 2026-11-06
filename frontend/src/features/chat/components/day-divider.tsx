import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

/** 날짜 구분 줄(피그마 S47 201-25095). 가운데 회색 알약에 "11.18(수)" */
export function DayDivider({ label }: { label: string }) {
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <View style={styles.pill}>
        <Text style={[typography.captionMedium, styles.text]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  pill: {
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: spacing[10],
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
  },
  text: { color: colors.text.sub },
});
