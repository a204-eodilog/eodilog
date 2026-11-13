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
          {/* 맨 위 요약. 여행이 모두 몇 개인지 큰 숫자로 먼저 보인다 */}
          <FadeIn from="mask">
            <View style={styles.summary}>
              <Text style={[typography.display, styles.count]}>{trips.length}</Text>
              <View style={styles.summaryText}>
                <Text style={[typography.bodyBold, styles.text]}>개의 여행</Text>
                <Text style={[typography.caption, styles.note]}>핀 없는 여행까지 보여요</Text>
              </View>
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
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  count: { color: colors.brand.primary },
  summaryText: { gap: spacing[2] },
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
  note: { color: colors.text.sub2 },
  sub: { color: colors.text.icon },
});
