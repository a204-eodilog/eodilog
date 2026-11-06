import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, Header } from '@/components/ui';
import { colors, layout, spacing, typography } from '@/theme';

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
      <Header onBack={onBack} />
      {trips.length === 0 ? (
        // 값 문서에 빈 상태가 없어 공통 빈 화면으로 둔다
        <EmptyState icon="trip" title="아직 여행이 없어요" />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: spacing[32] + insets.bottom }]}
        >
          <Text style={[typography.title1, styles.text]}>내 여행</Text>
          <Text style={[typography.caption, styles.note]}>핀 없는 여행까지 보여요</Text>
          {groupMyTrips(trips).map((group) => (
            <View key={group.status} style={styles.group}>
              <View style={styles.groupHead}>
                <Text style={[typography.title3, styles.text]}>{group.title}</Text>
                <Text style={[typography.caption, styles.sub]}>{group.trips.length}개</Text>
              </View>
              {group.trips.map((trip) => (
                <MyTripRow
                  key={trip.id}
                  title={trip.title}
                  period={formatPeriod(trip.startDate, trip.endDate)}
                  companions={companionNames(trip, myUserId)}
                  onPress={() => onOpen(trip)}
                />
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
    gap: spacing[20],
  },
  group: { gap: spacing[8] },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  text: { color: colors.text.default },
  note: { color: colors.text.sub2 },
  sub: { color: colors.text.icon },
});
