// 내 사진 찾기(/photo-search). 마이페이지에서 온다. 내 모든 여행 기간에 찍은 폰 사진을 폰 AI로 정리하고 문장으로 찾는다.
// 사진은 서버로 보내지 않는다
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenterNotice, Header } from '@/components/ui';
import { SkeletonList } from '@/components/ui/skeleton';
import { getAllMyTrips } from '@/features/my-trips';
import { getSettings } from '@/features/settings/api';
import { SETTINGS_QUERY_KEY } from '@/features/settings/hooks/use-server-settings';
import { colors, layout, spacing } from '@/theme';
import { SCROLL_DECELERATION } from '@/theme/scroll';

import { GalleryAiPanel } from '../components/gallery-ai-panel';
import { tripTimeRange } from '../search-rules';
import { useGalleryAi } from '../use-gallery-ai';

const COLUMNS = 3;
const GAP = spacing[8];

export function PhotoSearchScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tile = Math.floor(
    (Math.min(width, 480) - layout.screenPaddingX * 2 - GAP * (COLUMNS - 1)) / COLUMNS,
  );
  const trips = useQuery({ queryKey: ['me', 'trips'], queryFn: getAllMyTrips });
  const settings = useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: getSettings });

  // 기간이 정해진 여행만, 최근 여행부터
  const dated = useMemo(
    () =>
      (trips.data ?? [])
        .flatMap((t) => {
          const range = tripTimeRange(t.startDate, t.endDate);
          return range ? [{ title: t.title, range }] : [];
        })
        .sort((a, b) => b.range.after - a.range.after),
    [trips.data],
  );
  const ranges = useMemo(() => dated.map((d) => d.range), [dated]);
  const labels = useMemo(() => dated.map((d) => d.title), [dated]);
  const gallery = useGalleryAi({ ranges, aiMode: settings.data?.ai.photoClassification });

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/me'));

  return (
    <View style={styles.screen}>
      <Header title="내 사진 찾기" onBack={goBack} />
      {trips.isPending ? (
        <SkeletonList style={styles.flex} />
      ) : trips.isError ? (
        <CenterNotice
          icon="alert"
          title="여행을 불러오지 못했어요"
          actionLabel="다시 시도"
          onAction={() => void trips.refetch()}
        />
      ) : dated.length === 0 ? (
        <CenterNotice
          icon="image"
          tone="brand"
          title="날짜가 정해진 여행이 없어요"
          description="여행 기간에 찍은 사진을 폰에서 찾아 드려요"
        />
      ) : (
        <ScrollView
          decelerationRate={SCROLL_DECELERATION}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.body,
            { paddingBottom: Math.max(insets.bottom + spacing[24], 40) },
          ]}
        >
          <GalleryAiPanel
            ai={gallery}
            tile={tile}
            gap={GAP}
            mode="browse"
            title={`여행 ${dated.length}곳의 내 사진`}
            rangeLabels={labels}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  body: { paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[16], gap: spacing[16] },
});
