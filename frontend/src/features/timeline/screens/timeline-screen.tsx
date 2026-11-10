import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { CenterNotice, Header } from '@/components/ui';
import { colors } from '@/theme';

import { TimelineView } from '../components/timeline-view';
import { useTimeline } from '../hooks/use-timeline';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** S41 타임라인(/timeline). S37 마이페이지의 [타임라인]에서 연다. 여행 머리를 누르면 S42 */
export function TimelineScreen() {
  const timeline = useTimeline();
  return (
    <View style={styles.screen}>
      <Header onBack={goBack} />
      {timeline.state === 'loading' ? (
        <ActivityIndicator style={styles.loading} color={colors.brand.primary} />
      ) : timeline.state === 'error' ? (
        <CenterNotice
          icon="calendar"
          tone="brand"
          title="타임라인을 불러오지 못했어요"
          description="불러오지 못했어요. 다시 시도해 주세요."
          actionLabel="다시 시도"
          actionIcon="refresh"
          onAction={timeline.retry}
          secondaryLabel="돌아가기"
          onSecondary={goBack}
        />
      ) : (
        <TimelineView
          entries={timeline.entries}
          onOpen={(tripId) =>
            router.push({ pathname: '/trips/[tripId]/summary', params: { tripId } })
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { flex: 1 },
});
