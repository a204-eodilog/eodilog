import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui';
import { FadeIn } from '@/components/ui/fade-in';
import { formatPeriod } from '@/features/my-trips';
import { colors, layout, spacing, typography } from '@/theme';

import type { TimelineEntry } from '../hooks/use-timeline';
import { placeRows, tripTag } from '../timeline-rules';

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
      contentContainerStyle={[styles.content, { paddingBottom: spacing[32] + insets.bottom }]}
    >
      <FadeIn from="mask">
        <Text style={[typography.title1, styles.title]}>타임라인</Text>
      </FadeIn>
      {entries.map(({ item, trip, places }, order) => (
        <FadeIn key={trip.id} index={order + 1}>
          <TimelineTrip
            title={trip.title}
            period={formatPeriod(trip.startDate, trip.endDate) ?? '날짜 미정'}
            tag={tripTag(trip.status, item.feedId)}
            rows={placeRows(places, trip.status)}
            onOpen={() => onOpen(trip.id)}
          />
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
});
