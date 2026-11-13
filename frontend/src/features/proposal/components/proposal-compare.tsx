import { Fragment, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Stagger } from '@/components/ui/stagger';
import { Button, Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { MODE_ICON } from '@/features/course/components/course-day-list';
import { CourseMap } from '@/features/course/components/course-map';
import { legLabel, MODE_LABEL, type DayLeg, type DraftItem } from '@/features/course/course-rules';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { MARK_LABEL, type CompareRow, type Stat } from '../proposal-rules';

type Props = {
  summary: { title: string; sub: string | null };
  /** 요약 앞 아이콘. 빼기는 빼기, 바꾸기는 새로고침, 시간은 시계 */
  summaryIcon: IconName;
  stats: readonly Stat[];
  basis: string | null;
  items: DraftItem[];
  legs: DayLeg[];
  rows: readonly CompareRow[];
  removed: readonly DraftItem[];
  applying: boolean;
  onApply(): void;
  onSkip(): void;
  /** 적용 충돌 같은 안내. 아래 버튼 위에 둔다 */
  notice?: ReactNode;
};

/**
 * S29 비교(Figma 201-16028). 무엇이 바뀌는지, 숫자 칸 셋, 기준 줄, 바뀐 날 지도와 목록,
 * 아래 [적용 안 함]·[적용]. 승인 단계 없이 동행 누구나 적용한다.
 */
export function ProposalCompare(props: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <Stagger itemStyle={styles.staggerItem}>
          <View style={styles.summary}>
            <View style={styles.summaryIcon}>
              <Icon name={props.summaryIcon} size={20} color={colors.status.danger} />
            </View>
            <View style={styles.flex}>
              <Text style={[typography.bodyBold, styles.title]}>{props.summary.title}</Text>
              {props.summary.sub ? (
                <Text style={[typography.caption, styles.icon]}>{props.summary.sub}</Text>
              ) : null}
            </View>
          </View>
          <View style={styles.stats}>
            {props.stats.map((s) => (
              <View key={s.label} style={styles.stat}>
                <Text style={[typography.caption, styles.icon]}>{s.label}</Text>
                <Text style={[typography.bodyBold, styles.title]}>{s.value}</Text>
                <Text style={[typography.caption, styles.sub]}>{s.before}</Text>
              </View>
            ))}
          </View>
          {props.basis ? (
            <View style={styles.line}>
              <Icon name="clock" size={16} color={colors.text.sub} />
              <Text style={[typography.caption, styles.sub]}>{props.basis}</Text>
            </View>
          ) : null}
          <View style={styles.map}>
            <CourseMap items={props.items} legs={props.legs} badges={[]} tone="draft" />
          </View>
          <View style={styles.list}>
            {props.rows.map((row, i) => {
              const leg = i > 0 ? props.legs[i - 1] : null;
              const label = leg ? (legLabel(leg) ?? MODE_LABEL[leg.mode]) : null;
              return (
                <Fragment key={row.item.key}>
                  {leg ? (
                    <View style={styles.legRow}>
                      <View style={styles.legChip}>
                        <Icon name={MODE_ICON[leg.mode]} size={16} color={colors.text.icon} />
                        <Text style={[typography.captionMedium, styles.icon]}>{label}</Text>
                      </View>
                      {row.legChanged ? <Mark text="바뀜" tone="blue" /> : null}
                    </View>
                  ) : null}
                  <View style={styles.row}>
                    <View style={styles.number}>
                      <Text style={[typography.captionBold, styles.numberText]}>{i + 1}</Text>
                    </View>
                    <View style={styles.flex}>
                      <View style={styles.timeRow}>
                        {row.item.startTime ? (
                          <Text style={[typography.captionMedium, styles.icon]}>
                            {row.item.startTime}
                          </Text>
                        ) : null}
                        {row.before ? (
                          <Text style={[typography.caption, styles.struck]}>{row.before}</Text>
                        ) : null}
                      </View>
                      <Text style={[typography.bodyBold, styles.title]} numberOfLines={1}>
                        {row.item.place.name}
                      </Text>
                    </View>
                    {row.mark === 'same' ? (
                      <Text style={[typography.caption, styles.sub]}>{MARK_LABEL.same}</Text>
                    ) : (
                      <Mark text={MARK_LABEL[row.mark]} tone="blue" />
                    )}
                  </View>
                </Fragment>
              );
            })}
            {props.removed.map((item) => (
              <View key={item.key} style={[styles.row, styles.removed]}>
                <View style={styles.removedIcon}>
                  <Icon name="close" size={18} color={colors.text.sub} />
                </View>
                <Text style={[typography.body, styles.struckName]} numberOfLines={1}>
                  {item.place.name}
                </Text>
                <Mark text="빠짐" tone="gray" />
              </View>
            ))}
          </View>
        </Stagger>
      </ScrollView>
      {props.notice}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing[12] }]}>
        <PressableScale
          accessibilityLabel="적용 안 함"
          style={styles.skip}
          onPress={props.onSkip}
          accessibilityRole="button"
        >
          <Icon name="close" size={20} color={colors.text.icon} />
        </PressableScale>
        <Button
          label="적용"
          icon="check"
          weight="medium"
          loading={props.applying}
          onPress={props.onApply}
        />
      </View>
    </View>
  );
}

function Mark({ text, tone }: { text: string; tone: 'blue' | 'gray' }) {
  return (
    <View style={[styles.mark, tone === 'blue' ? styles.markBlue : styles.markGray]}>
      <Text style={[typography.captionMedium, tone === 'blue' ? styles.markBlueText : styles.icon]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // 차례로 나타나는 구역을 감싼 칸. 한 구역이 여러 줄이면 그 사이 간격을 스크롤 내용과 같게 둔다
  staggerItem: { gap: spacing[18] },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    gap: spacing[18],
    paddingBottom: spacing[24],
  },
  title: { color: colors.text.default },
  icon: { color: colors.text.icon },
  sub: { color: colors.text.sub },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[18],
    paddingHorizontal: spacing[20],
    paddingVertical: spacing[18],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { flexDirection: 'row', gap: spacing[10] },
  stat: {
    flex: 1,
    gap: spacing[2],
    paddingHorizontal: spacing[14],
    paddingVertical: spacing[10],
    borderRadius: radius.md + 2,
    backgroundColor: colors.brand.primaryBg,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  map: { marginHorizontal: -layout.screenPaddingX },
  list: { gap: spacing[8] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[14], minHeight: 48 },
  number: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { color: colors.text.inverse },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  struck: { color: colors.text.sub, textDecorationLine: 'line-through' },
  legRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[8], paddingLeft: 40 },
  legChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    height: 28,
    paddingHorizontal: spacing[10],
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
  },
  mark: {
    height: 20,
    paddingHorizontal: spacing[6],
    borderRadius: radius.xs + 2,
    justifyContent: 'center',
  },
  markBlue: { backgroundColor: colors.brand.primaryLight },
  markBlueText: { color: colors.brand.primaryDark },
  markGray: { backgroundColor: colors.line.default },
  removed: { opacity: 0.64, minHeight: 40 },
  removedIcon: { width: 28, alignItems: 'center' },
  struckName: { flex: 1, color: colors.text.sub, textDecorationLine: 'line-through' },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing[10],
    paddingTop: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
  },
  skip: { height: 48, paddingHorizontal: spacing[16], justifyContent: 'center' },
});
