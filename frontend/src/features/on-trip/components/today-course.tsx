import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Icon } from '@/components/ui';
import { MODE_ICON } from '@/features/course/components/course-day-list';
import { legLabel, type DayLeg, type DraftItem } from '@/features/course/course-rules';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  items: readonly DraftItem[];
  legs: readonly DayLeg[];
  /** 지금 이후 첫 일정. 파란 번호와 '다음' */
  next: number | null;
  /** 이동 시간을 구한 시각 "09:40". 없으면 줄을 숨긴다 */
  computedAt: string | null;
  onCourse(): void;
};

/** S25 오늘 코스(Figma 201-14252). 번호, 시각, 이름, 구간 시간 */
export function TodayCourse({ items, legs, next, computedAt, onCourse }: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={[typography.title3, styles.title]}>오늘 코스</Text>
        <Pressable style={styles.link} onPress={onCourse} accessibilityRole="button" hitSlop={8}>
          <Text style={[typography.captionMedium, styles.linkText]}>코스</Text>
          <Icon name="chevron-right" size={14} color={colors.brand.primaryDark} />
        </Pressable>
      </View>
      {computedAt ? (
        <View style={styles.line}>
          <Icon name="clock" size={16} color={colors.text.sub} />
          <Text style={[typography.caption, styles.sub]}>{`이동 시간 ${computedAt} 계산`}</Text>
        </View>
      ) : null}
      <View style={styles.list}>
        {items.map((item, i) => {
          const leg = i > 0 ? legs[i - 1] : null;
          const label = leg ? legLabel(leg) : null;
          return (
            <Fragment key={item.key}>
              {leg && label ? (
                <View style={styles.legRow}>
                  <View style={styles.legChip}>
                    <Icon name={MODE_ICON[leg.mode]} size={16} color={colors.text.icon} />
                    <Text style={[typography.captionMedium, styles.legText]}>{label}</Text>
                  </View>
                </View>
              ) : null}
              <View style={styles.item}>
                <View style={[styles.number, i === next ? styles.numberNext : styles.numberLater]}>
                  <Text style={[typography.captionBold, styles.numberText]}>{i + 1}</Text>
                </View>
                <View style={styles.texts}>
                  <View style={styles.timeRow}>
                    {item.startTime ? (
                      <Text style={[typography.captionMedium, styles.time]}>{item.startTime}</Text>
                    ) : null}
                    {i === next ? (
                      <View style={styles.nextTag}>
                        <Text style={[typography.captionMedium, styles.nextText]}>다음</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[typography.bodyBold, styles.name]} numberOfLines={1}>
                    {item.place.name}
                  </Text>
                </View>
              </View>
            </Fragment>
          );
        })}
      </View>
    </View>
  );
}

/** S25 코스 없음(Figma 201-14433). [코스 짜러 가기] */
export function NoCourse({ onMake }: { onMake(): void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name="route" size={24} color={colors.text.default} />
      </View>
      <Text style={[typography.title2, styles.title]}>저장한 코스가 없어요</Text>
      <Text style={[typography.body, styles.sub]}>코스를 저장하면 오늘 갈 곳이 보여요</Text>
      <Button
        label="코스 짜러 가기"
        leading={<Icon name="route" size={18} color={colors.text.inverse} />}
        onPress={onMake}
        style={styles.emptyButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing[12] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text.default },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  linkText: { color: colors.brand.primaryDark },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  sub: { color: colors.text.sub, textAlign: 'center' },
  list: { gap: spacing[8] },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing[14], minHeight: 48 },
  number: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberNext: { backgroundColor: colors.brand.primary },
  numberLater: { backgroundColor: colors.text.muted },
  numberText: { color: colors.text.inverse },
  texts: { flex: 1 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  time: { color: colors.text.icon },
  nextTag: {
    height: 20,
    paddingHorizontal: spacing[6],
    borderRadius: radius.xs + 2,
    backgroundColor: colors.brand.primaryLight,
    justifyContent: 'center',
  },
  nextText: { color: colors.brand.primaryDark },
  name: { color: colors.text.default },
  legRow: { flexDirection: 'row', paddingLeft: 40 },
  legChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    height: 28,
    paddingHorizontal: spacing[10],
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
  },
  legText: { color: colors.text.icon },
  empty: {
    alignItems: 'center',
    gap: spacing[8],
    paddingVertical: spacing[28],
    paddingHorizontal: spacing[20],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.default,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[8],
  },
  emptyButton: { alignSelf: 'center', marginTop: spacing[12] },
});
