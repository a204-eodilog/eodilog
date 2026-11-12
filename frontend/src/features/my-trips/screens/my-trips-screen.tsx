import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { CenterNotice, Header } from '@/components/ui';
import { SkeletonList } from '@/components/ui/skeleton';
import { colors } from '@/theme';

import { MyTripsView } from '../components/my-trips-view';
import { useMyTrips } from '../hooks/use-my-trips';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** N4 내 여행 목록. S37 마이페이지의 [내 여행 목록]에서 연다. 줄을 누르면 S38 내 여행 기록 */
export function MyTripsScreen() {
  const board = useMyTrips();

  if (board.isLoading || board.error) {
    return (
      <View style={styles.screen}>
        <Header onBack={goBack} />
        {board.isLoading ? (
          <SkeletonList style={styles.loading} />
        ) : (
          <CenterNotice
            icon="trip"
            tone="brand"
            title="내 여행 목록을 불러오지 못했어요"
            description="불러오지 못했어요. 다시 시도해 주세요."
            actionLabel="다시 시도"
            actionIcon="refresh"
            onAction={board.refetch}
            secondaryLabel="돌아가기"
            onSecondary={goBack}
          />
        )}
      </View>
    );
  }

  return (
    <MyTripsView
      trips={board.trips}
      myUserId={board.myUserId}
      onBack={goBack}
      onOpen={(trip) =>
        router.push({ pathname: '/trips/[tripId]/record', params: { tripId: trip.id } })
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { flex: 1 },
});
