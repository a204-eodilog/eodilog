import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { formatShortDate, parseDate } from '@/lib/format-date';
import { colors, radius, spacing, typography } from '@/theme';

import { conditionIcon, dateClock, forecastLabel, tempLine } from '../on-trip-rules';
import type { Weather } from '../types';

type Props = {
  /** 여행 시작일 YYYY-MM-DD. 날짜가 없으면 null */
  startDate: string | null;
  /** "부산" */
  regionName: string | null;
  /** 날짜별 예보. 장소가 있는 날만(Q-10-4) */
  forecasts: Weather[];
  checklist: { total: number; checked: number } | null;
  onChecklist(): void;
};

/**
 * S25 여행 시작 전(Figma 201-14584). 언제부터 여행 중으로 바뀌는지, 날짜별 예보, 준비물 진행.
 * 날짜가 없는 여행은 준비물 진행만 보인다.
 */
export function BeforeStart({ startDate, regionName, forecasts, checklist, onChecklist }: Props) {
  const start = parseDate(startDate);
  const ratio = checklist && checklist.total > 0 ? checklist.checked / checklist.total : 0;
  const latest = forecasts.reduce<string | null>(
    (m, w) => (m === null || w.queriedAt > m ? w.queriedAt : m),
    null,
  );
  return (
    <View style={styles.wrap}>
      {start ? (
        <View style={styles.banner}>
          <Icon name="map-pin" size={22} color={colors.brand.primaryDark} />
          <View style={styles.flex}>
            <Text style={[typography.bodyBold, styles.title]}>
              {`${formatShortDate(start)}부터 여행 중으로 바뀌어요`}
            </Text>
            <Text style={[typography.caption, styles.sub]}>그때부터 오늘 코스가 보여요</Text>
          </View>
        </View>
      ) : null}
      {forecasts.length > 0 ? (
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={[typography.bodyBold, styles.title]}>
              {`${regionName ? `${regionName} ` : ''}날씨 예보`}
            </Text>
            {latest ? (
              <Text style={[typography.caption, styles.sub]}>{`${dateClock(latest)} 조회`}</Text>
            ) : null}
          </View>
          {forecasts.map((w) => {
            const date = parseDate(w.date);
            return (
              <View key={w.date} style={styles.day}>
                <Icon name={conditionIcon(w.condition)} size={22} color={colors.text.icon} />
                <Text style={[typography.caption, styles.date]}>
                  {date ? formatShortDate(date) : w.date}
                </Text>
                <Text style={[typography.bodyBold, styles.condition]}>{forecastLabel(w)}</Text>
                <Text style={[typography.caption, styles.sub]}>{tempLine(w) ?? ''}</Text>
              </View>
            );
          })}
          <View style={styles.note}>
            <Icon name="info" size={16} color={colors.text.icon} />
            <Text style={[typography.caption, styles.sub]}>전날 다시 알려요</Text>
          </View>
        </View>
      ) : null}
      <Pressable
        style={styles.checklist}
        onPress={onChecklist}
        accessibilityRole="button"
        accessibilityLabel="준비물"
      >
        <View style={styles.checklistTop}>
          <Icon name="bag" size={22} color={colors.text.default} />
          <Text style={[typography.bodyBold, styles.title, styles.flex]}>준비물</Text>
          {checklist ? (
            <Text style={[typography.captionMedium, styles.progressText]}>
              {`${checklist.total}개 중 ${checklist.checked}개 챙겼어요`}
            </Text>
          ) : null}
          <Icon name="chevron-right" size={18} color={colors.text.muted} />
        </View>
        {checklist ? (
          <View style={styles.bar}>
            <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[16] },
  flex: { flex: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    padding: spacing[20],
    borderRadius: radius.xl,
    backgroundColor: colors.brand.primaryBg,
  },
  title: { color: colors.text.default },
  sub: { color: colors.text.icon },
  card: {
    gap: spacing[12],
    padding: spacing[20],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.default,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  day: { flexDirection: 'row', alignItems: 'center', gap: spacing[10], minHeight: 40 },
  date: { width: 64, color: colors.text.icon },
  condition: { flex: 1, color: colors.text.default },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  checklist: {
    gap: spacing[12],
    padding: spacing[20],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.default,
  },
  checklistTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[10] },
  progressText: { color: colors.brand.primary },
  bar: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.line.default,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: radius.full, backgroundColor: colors.brand.primary },
});
