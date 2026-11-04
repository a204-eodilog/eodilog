import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, Header, toast } from '@/components/ui';
import { useMe } from '@/hooks/use-me';
import { useSeoulToday } from '@/hooks/use-seoul-today';
import { colors, layout, spacing } from '@/theme';

import { TodoSteps } from '../components/todo-steps';
import { TripHero } from '../components/trip-hero';
import { TripMenuGrid } from '../components/trip-menu-grid';
import { useRegionNames } from '../hooks/use-region-names';
import { useTrip } from '../hooks/use-trip';
import { companionsLabel, tripDetailView } from '../trip-rules';

const comingSoon = () => toast.show('준비 중이에요');

/** S17 여행 상세(허브). 상태에 맞는 지금 할 일과 여행 메뉴 */
export function TripDetailScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { data: trip, isPending, isError, notFound, refetch } = useTrip(tripId);
  const { data: me } = useMe();
  const regionNames = useRegionNames(trip?.destinationRegionIds ?? []);
  // 앱이 다시 앞으로 오면 새로 구한다. 자정을 넘기면 제목·단계가 바뀐다
  const today = useSeoulToday();
  const insets = useSafeAreaInsets();

  if (isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand.primary} />
      </View>
    );
  }

  if (notFound || (isError && !trip)) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.screen}>
        <Header />
        {notFound ? (
          <EmptyState
            icon="alert"
            title="볼 수 없는 여행이에요"
            description="참여하지 않았거나 이미 나간 여행이에요"
            actionLabel="여행 목록으로"
            onAction={() => router.replace('/trips')}
          />
        ) : (
          <ErrorState onRetry={() => refetch()} />
        )}
      </SafeAreaView>
    );
  }

  if (!trip) return null;

  const view = tripDetailView(trip, regionNames, today);

  return (
    // 화면을 안드로이드 하단 버튼 줄(갤럭시 내비게이션 바) 위에서 끝낸다. 스크롤 끝에 여백만 주면
    // 내용이 화면에 딱 맞을 때 여행 메뉴 아래 줄(사진·평가·경비·게시·채팅)이 바에 가린다
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TripHero
          trip={trip}
          headline={view.headline}
          companions={companionsLabel(trip.members, me?.id ?? null)}
        />
        <View style={styles.body}>
          <TodoSteps
            nickname={me?.nickname ?? null}
            view={view}
            onAction={comingSoon}
            onPublish={comingSoon}
          />
          <TripMenuGrid />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing[32] },
  screen: { flex: 1, backgroundColor: colors.surface.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[24], gap: spacing[32] },
});
