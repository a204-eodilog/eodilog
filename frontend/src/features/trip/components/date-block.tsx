import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, radius, typography } from '@/theme';

type Props = {
  /** 'YYYY-MM-DD'. 없으면 달력 아이콘만 그린다 */
  date: string | null;
  /** brand: 다가오는 여행(파랑 띠), muted: 다녀온 여행(회색 띠) */
  tone: 'brand' | 'muted';
};

/**
 * 달력 한 장 모양 날짜 칸(S15 다음 계획·다녀온 여행). 위 띠에 달, 아래에 날을 크게 둔다.
 * 글로 "11월 22일"이라 쓰는 대신 달력 그림으로 읽히게 한다(2026-11-05 사용자 요청: 글보다 아이콘)
 */
export function DateBlock({ date, tone }: Props) {
  const brand = tone === 'brand';
  // 기간이 없으면 띠 색 없이 달력 아이콘만 둔다(2026-11-05 사용자 요청)
  if (!date) {
    return (
      <View style={[styles.block, styles.empty]} accessible={false}>
        <Icon name="calendar" size={20} color={colors.text.muted} />
      </View>
    );
  }
  return (
    <View style={styles.block} accessible={false}>
      <View style={[styles.strip, brand ? styles.stripBrand : styles.stripMuted]}>
        <Text style={[typography.micro, styles.month]}>{`${Number(date.slice(5, 7))}월`}</Text>
      </View>
      <View style={styles.body}>
        <Text style={[typography.title3, brand ? styles.dayBrand : styles.dayMuted]}>
          {Number(date.slice(8, 10))}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 48x54. 위 띠 18, 아래 36
  block: {
    width: 48,
    height: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line.default,
    backgroundColor: colors.surface.white,
    overflow: 'hidden',
  },
  empty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface.subtle },
  strip: { height: 18, alignItems: 'center', justifyContent: 'center' },
  stripBrand: { backgroundColor: colors.brand.primary },
  stripMuted: { backgroundColor: colors.gray[400] },
  month: { color: colors.text.inverse },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dayBrand: { color: colors.text.default },
  dayMuted: { color: colors.text.sub },
});
