import { SCROLL_DECELERATION } from '@/theme/scroll';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui';
import { FadeIn } from '@/components/ui/fade-in';
import { formatPeriod } from '@/features/my-trips';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { TimelineEntry } from '../hooks/use-timeline';
import { groupByMonth, placeRows, tripTag } from '../timeline-rules';

import { TimelineTrip } from './timeline-trip';

type TimelineViewProps = {
  entries: TimelineEntry[];
  onOpen: (tripId: string) => void;
};

/** S41 본문. 여행 시작일 최신순, 날짜 없는 여행은 맨 아래(순서는 useTimeline이 맞춘다) */
export function TimelineView({ entries, onOpen }: TimelineViewProps) {
  // 하단 탭이 없는 화면이라 기기 아래 막대 높이만큼 목록 끝을 더 띄운다
  const insets = useSafeAreaInsets();
  if (entries.length === 0) {
    // 값 문서에 빈 상태가 없어 공통 빈 화면으로 둔다
    return <EmptyState icon="calendar" title="아직 여행이 없어요" />;
  }
  return (
    <ScrollView
      decelerationRate={SCROLL_DECELERATION}
      contentContainerStyle={[styles.content, { paddingBottom: spacing[32] + insets.bottom }]}
    >
      <FadeIn from="mask">
        <Text style={[typography.title1, styles.title]}>타임라인</Text>
      </FadeIn>
      {/* 달마다 묶는다. 달 머리(큰 달 숫자, 연도, 여행 수, 가는 줄) 아래에 그 달의 여행 카드 */}
      {groupByMonth(entries, (e) => e.trip.startDate).map((group, order) => (
        <FadeIn key={group.key} index={order + 1} style={styles.month}>
          <View style={styles.monthHead} accessibilityRole="header">
            <Text style={[typography.title2, styles.monthText]}>{group.month}</Text>
            {group.year ? (
              <Text style={[typography.caption, styles.year]}>{group.year}</Text>
            ) : null}
            <View style={styles.count}>
              <Text style={[typography.captionBold, styles.countText]}>{group.entries.length}</Text>
            </View>
            <View style={styles.rule} />
          </View>
          {group.entries.map(({ item, trip, places }) => (
            <TimelineTrip
              key={trip.id}
              title={trip.title}
              period={formatPeriod(trip.startDate, trip.endDate) ?? '날짜 미정'}
              tag={tripTag(trip.status, item.feedId)}
              rows={placeRows(places, trip.status)}
              onOpen={() => onOpen(trip.id)}
            />
          ))}
        </FadeIn>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    gap: spacing[16],
  },
  title: { color: colors.text.default },
  // 달 묶음. 묶음 사이는 넓게(스크롤 내용 간격), 묶음 안 카드 사이는 좁게 둬서 한 덩어리로 보인다
  month: { gap: spacing[10], marginTop: spacing[8] },
  // 달 머리: 큰 달 숫자, 연도, 여행 수, 오른쪽으로 뻗는 가는 줄
  monthHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  monthText: { color: colors.text.default },
  year: { color: colors.text.sub },
  count: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: spacing[8],
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primaryBg,
  },
  countText: { color: colors.brand.primary },
  rule: { flex: 1, height: 1, backgroundColor: colors.line.strong },
});
