import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

import { CenterNotice, Header } from '@/components/ui';
import { colors } from '@/theme';

import { TripSummaryView } from '../components/trip-summary-view';
import { useTripSummary } from '../hooks/use-trip-summary';
import { summaryCells } from '../timeline-rules';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** S42 여행 요약 카드(/trips/[tripId]/summary). S41 여행 머리에서 연다. 누르는 것은 뒤로뿐 */
export function TripSummaryScreen() {
  const { tripId = '' } = useLocalSearchParams<{ tripId: string }>();
  const data = useTripSummary(tripId);
  const { trip, summary } = data;
  return (
    <View style={styles.screen}>
      <Header onBack={goBack} />
      {data.state === 'error' ? (
        <CenterNotice
          icon="map"
          tone="brand"
          title="요약 카드를 만들지 못했어요"
          description="다시 시도해 주세요"
          actionLabel="다시 시도"
          actionIcon="refresh"
          onAction={data.retry}
          secondaryLabel="돌아가기"
          onSecondary={goBack}
        />
      ) : data.state === 'ready' && trip && summary ? (
        <TripSummaryView
          title={trip.title}
          {...summaryCells(summary, trip)}
          route={data.route}
          coverAssetId={data.coverAssetId}
        />
      ) : (
        <Spinner style={styles.loading} color={colors.brand.primary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { flex: 1 },
});
