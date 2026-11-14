import { SCROLL_DECELERATION } from '@/theme/scroll';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, Header } from '@/components/ui';
import { FadeIn } from '@/components/ui/fade-in';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { companionNames, formatPeriod, groupMyTrips } from '../my-trip-rules';
import type { MyTrip } from '../types';

import { MyTripRow } from './my-trip-row';

export type MyTripsViewProps = {
  trips: MyTrip[];
  myUserId: string | undefined;
  onOpen: (trip: MyTrip) => void;
  onBack?: () => void;
};

/** N4 내 여행 목록. 지도 핀이 없는 여행까지 내가 참여 중인 여행을 모두 보여 준다 */
export function MyTripsView({ trips, myUserId, onOpen, onBack }: MyTripsViewProps) {
  // 하단 탭이 없는 화면이라 기기 아래 막대(제스처·버튼) 높이만큼 목록 끝을 더 띄운다
  const insets = useSafeAreaInsets();
  // 요약 숫자: 전체와 묶음별 수. 여행 중은 있을 때만 보인다
  const countOf = (status: MyTrip['status']) => trips.filter((t) => t.status === status).length;
  const stats = [
    { label: '전체', count: trips.length },
    ...(countOf('ONGOING') > 0 ? [{ label: '여행 중', count: countOf('ONGOING') }] : []),
    { label: '다녀온 여행', count: countOf('COMPLETED') },
    { label: '계획 중', count: countOf('PLANNING') },
  ];
  return (
    <View style={styles.screen}>
      <Header onBack={onBack} title="내 여행" />
      {trips.length === 0 ? (
        // 값 문서에 빈 상태가 없어 공통 빈 화면으로 둔다
        <EmptyState icon="trip" title="아직 여행이 없어요" />
      ) : (
        <ScrollView
          decelerationRate={SCROLL_DECELERATION}
          contentContainerStyle={[styles.content, { paddingBottom: spacing[32] + insets.bottom }]}
        >
          {/* 맨 위 요약. 아래 여행 카드와 헷갈리지 않게 바탕 없이 숫자만 나란히 둔다(2026-11-14 사용자 지적) */}
          <FadeIn from="mask">
            <View style={styles.summary}>
              {stats.map((stat, i) => (
                <View
                  key={stat.label}
                  style={[styles.stat, i > 0 && styles.statDivider]}
                  accessible
                  accessibilityLabel={`${stat.label} ${stat.count}개`}
                >
                  <Text style={[typography.title1, i === 0 ? styles.count : styles.text]}>
                    {stat.count}
                  </Text>
                  <Text style={[typography.caption, styles.note]}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </FadeIn>
          {groupMyTrips(trips).map((group) => (
            <View key={group.status} style={styles.group}>
              <View style={styles.groupHead}>
                <Text style={[typography.title3, styles.text]}>{group.title}</Text>
                <View style={styles.badge}>
                  <Text style={[typography.captionBold, styles.badgeText]}>
                    {group.trips.length}
                  </Text>
                </View>
              </View>
              {group.trips.map((trip, i) => (
                <FadeIn key={trip.id} index={i}>
                  <MyTripRow
                    title={trip.title}
                    period={formatPeriod(trip.startDate, trip.endDate)}
                    companions={companionNames(trip, myUserId)}
                    onPress={() => onOpen(trip)}
                  />
                </FadeIn>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: spacing[32],
    gap: spacing[24],
  },
  // 숫자 칸을 같은 폭으로 나란히. 칸 사이는 얇은 세로선으로만 나눈다
  summary: { flexDirection: 'row', paddingVertical: spacing[4] },
  stat: { flex: 1, alignItems: 'center', gap: spacing[2] },
  statDivider: { borderLeftWidth: 1, borderLeftColor: colors.line.default },
  count: { color: colors.brand.primary },
  group: { gap: spacing[10] },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  badge: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: spacing[8],
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primaryBg,
  },
  badgeText: { color: colors.brand.primary },
  text: { color: colors.text.default },
  note: { color: colors.text.icon },
  sub: { color: colors.text.icon },
});
