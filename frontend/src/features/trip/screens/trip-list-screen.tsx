import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, EmptyState, ErrorState, Icon } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { TripRow } from '../components/trip-row';
import { UpcomingTripCard } from '../components/upcoming-trip-card';
import { useMyTrips } from '../hooks/use-my-trips';
import type { TripListState } from '../trip-rules';
import type { Trip, TripSections } from '../types';

type Item =
  | { type: 'featured'; trip: Trip }
  | { type: 'section'; title: string }
  | { type: 'trip'; trip: Trip };

function toItems({ featured, next, past }: TripSections): Item[] {
  const items: Item[] = [];
  if (featured) items.push({ type: 'featured', trip: featured });
  if (next.length > 0) {
    items.push({ type: 'section', title: '다음 계획' });
    next.forEach((trip) => items.push({ type: 'trip', trip }));
  }
  if (past.length > 0) {
    items.push({ type: 'section', title: '다녀온 여행' });
    past.forEach((trip) => items.push({ type: 'trip', trip }));
  }
  return items;
}

const EMPTY: Item[] = [];

const itemsOf = (state: TripListState) =>
  state.kind === 'ready' ? toItems(state.sections) : EMPTY;

const openTrip = (trip: Trip) =>
  router.push({ pathname: '/trips/[tripId]', params: { tripId: trip.id } });
const openNew = () => router.push('/trips/new');

/** S15 여행 목록. 맨 위 카드(여행 중 → 다가오는 여행) + 다음 계획 + 다녀온 여행 */
export function TripListScreen() {
  const { listState, today, refetch } = useMyTrips();
  // 당겨서 새로고침 표시는 사람이 당겼을 때만 켠다. 탭 복귀·앱 복귀 때 조용히 다시 받는 동안에는
  // 화면 위 동그라미(RefreshControl)를 띄우지 않는다
  const [pulling, setPulling] = useState(false);
  const onPullRefresh = async () => {
    setPulling(true);
    try {
      await refetch();
    } finally {
      setPulling(false);
    }
  };
  const items = useMemo(() => itemsOf(listState), [listState]);

  // 탭에 돌아오면 다시 받는다(만든 여행·다른 기기에서 나간 여행 반영). 진행 중인 요청은 끊지 않고 그 결과를 쓴다
  useFocusEffect(
    useCallback(() => {
      refetch({ cancelRefetch: false });
    }, [refetch]),
  );

  const header = (
    <View style={styles.header}>
      <Text style={[typography.title2, styles.heading]}>여행</Text>
      <Button
        label="새 여행"
        size="sm"
        variant="secondary"
        leading={<Icon name="plus" size={16} color={colors.brand.primary} />}
        onPress={openNew}
      />
    </View>
  );

  let body;
  if (listState.kind === 'loading') {
    body = <ActivityIndicator style={styles.loading} color={colors.brand.primary} />;
  } else if (listState.kind === 'error') {
    body = <ErrorState onRetry={() => refetch()} />;
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon="trip"
        title="아직 여행이 없어요"
        description="새 여행을 만들거나 초대 링크로 참여해요"
        actionLabel="새 여행"
        onAction={openNew}
      />
    );
  } else {
    body = (
      <FlashList
        data={items}
        keyExtractor={(item, i) =>
          item.type === 'section' ? `s-${item.title}` : `${item.type}-${item.trip.id}-${i}`
        }
        getItemType={(item) => item.type}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPullRefresh} />}
        ListHeaderComponent={
          listState.stale ? (
            <View style={styles.offline}>
              <Icon name="alert" size={16} color={colors.status.warning} />
              <Text style={[typography.caption, styles.offlineText]}>연결이 불안정해요</Text>
              <Text
                accessibilityRole="button"
                onPress={() => refetch()}
                style={[typography.label, styles.offlineAction]}
              >
                다시 불러오기
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.type === 'featured') {
            return (
              <View style={styles.featured}>
                <UpcomingTripCard
                  trip={item.trip}
                  today={today}
                  onPress={() => openTrip(item.trip)}
                />
              </View>
            );
          }
          if (item.type === 'section') {
            return <Text style={[typography.title3, styles.section]}>{item.title}</Text>;
          }
          return <TripRow trip={item.trip} onPress={() => openTrip(item.trip)} />;
        }}
      />
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      {header}
      <View style={styles.flex}>{body}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPaddingX,
    height: 56,
  },
  heading: { color: colors.text.default },
  loading: { marginTop: spacing[32] },
  featured: { paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[8] },
  section: {
    color: colors.text.default,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[24],
    paddingBottom: spacing[8],
  },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    marginHorizontal: layout.screenPaddingX,
    marginBottom: spacing[8],
    padding: spacing[12],
    borderRadius: radius.md,
    backgroundColor: colors.status.warningBg2,
  },
  offlineText: { flex: 1, color: colors.status.warning },
  offlineAction: { color: colors.brand.primary },
});
