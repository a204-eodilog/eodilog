import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorState, Header, toast } from '@/components/ui';
import { Spinner } from '@/components/ui/spinner';
import { colors } from '@/theme';

import { TripGoneState } from '../components/trip-gone-state';
import { useRegions } from '../hooks/use-region-names';
import { useTrip } from '../hooks/use-trip';
import { useTripEditDraft } from '../hooks/use-trip-edit-draft';
import { useUpdateTrip } from '../hooks/use-update-trip';

import { RegionSearchScreen } from './region-search-screen';

/**
 * 여행지만 골라 바로 저장하는 화면. 코스 짜기의 [여행지 정하기]와 투표 0표의 [직접 정하기]에서 연다.
 * 여행 설정(S19)의 여행지 검색은 고른 값을 입력 스토어에만 담고 설정의 [완료]가 저장한다.
 * 여기는 아래에 설정 화면이 없으므로 [고르기]를 누를 때 이 화면이 저장한다
 */
export function TripRegionScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { data: trip, isFetchedAfterMount, isError, notFound, refetch } = useTrip(tripId);
  const { regions, ready, failed, retry } = useRegions(trip?.destinationRegionIds ?? []);
  const fill = useTripEditDraft((s) => s.fill);
  const reset = useTripEditDraft((s) => s.reset);
  const update = useUpdateTrip(tripId);
  const navigation = useNavigation();
  /** 입력 스토어가 이 여행으로 채워졌는가. 닫을 때 비우므로 열 때는 언제나 비어 있다 */
  const filled = useTripEditDraft((s) => s.base?.id === tripId);
  /** 저장 중. 두 번째 누름을 막는다 */
  const saving = useRef(false);

  // 받아 둔 여행이 오래됐으면 저장이 409를 받는다. 열 때 한 번 새로 받는다
  useEffect(() => {
    void refetch();
  }, [refetch]);

  // 새로 받은 여행으로 한 번만 채운다. 그 뒤 여행을 다시 받아도 고르던 값을 덮지 않는다
  useEffect(() => {
    if (filled || !trip || !isFetchedAfterMount || !ready) return;
    fill(trip, regions);
  }, [filled, trip, isFetchedAfterMount, ready, regions, fill]);

  // 화면이 닫히면 고르던 값을 버린다
  useEffect(() => reset, [reset]);

  const failure = update.failure;
  useEffect(() => {
    if (failure === 'error') toast.show('여행지를 저장하지 못했어요. 다시 눌러 주세요');
  }, [failure]);

  const done = async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      const result = await update.save();
      // 저장하는 사이 먼저 뒤로 갔으면 이 화면은 이미 닫혔다. 그때 또 뒤로 가면 아래 화면까지 닫힌다
      if (result !== 'failed' && navigation.isFocused()) router.back();
    } finally {
      saving.current = false;
    }
  };

  if (filled) return <RegionSearchScreen draft="edit" onDone={done} busy={update.isPending} />;

  return (
    <View style={styles.screen}>
      <Header title="여행지" />
      {notFound ? (
        <TripGoneState />
      ) : isError && !trip ? (
        <ErrorState onRetry={() => refetch()} />
      ) : failed ? (
        <ErrorState onRetry={retry} />
      ) : (
        <View style={styles.center}>
          <Spinner color={colors.brand.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
