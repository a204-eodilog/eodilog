import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  /** "1일차"와 날짜·지역 "11.14(토) · 부산" */
  days: { title: string; sub: string | null }[];
  selected: number;
  onSelect(day: number): void;
};

/** 일차 탭(Figma 201-12879 일차 줄). 고른 날은 연파랑 바탕에 파랑 글자 */
export function DayTabs({ days, selected, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {days.map((d, i) => {
        const on = i === selected;
        return (
          <Pressable
            key={d.title}
            onPress={() => onSelect(i)}
            style={[styles.tab, on ? styles.tabOn : styles.tabOff, days.length <= 2 && styles.grow]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[typography.bodyBold, on ? styles.on : styles.off]}>{d.title}</Text>
            {d.sub ? (
              <Text style={[typography.caption, on ? styles.on : styles.offSub]}>{d.sub}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing[8], flexGrow: 1 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[6],
    height: 44,
    paddingHorizontal: spacing[16],
    borderRadius: radius.md,
  },
  grow: { flex: 1 },
  tabOn: { backgroundColor: colors.brand.primaryLight },
  tabOff: { backgroundColor: colors.surface.default },
  on: { color: colors.brand.primaryDark },
  off: { color: colors.text.default },
  offSub: { color: colors.text.sub },
});
