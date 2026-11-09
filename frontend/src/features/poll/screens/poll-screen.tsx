import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AvatarGroup, ErrorState, Header } from '@/components/ui';
import { useTrip } from '@/features/trip/hooks/use-trip';
import { colors, spacing, typography } from '@/theme';

import { OpenPollSheet } from '../components/open-poll-sheet';
import { PollEmptyView } from '../components/poll-views';
import { usePoll } from '../hooks/use-poll';
import { usePolls } from '../hooks/use-polls';
import { pollTypeLabel } from '../poll-rules';
import type { Poll } from '../types';

/**
 * S22 지역·장소 투표. 주소에 투표 ID가 있으면 그 투표를, 없으면 대표 투표를 보인다(research R7).
 * 투표가 없으면 진행 중인 투표 없음과 N8 투표 열기 시트
 */
export function PollScreen() {
  const { tripId, pollId } = useLocalSearchParams<{ tripId: string; pollId?: string }>();
  const trip = useTrip(tripId);
  const list = usePolls(tripId, !pollId);
  const targetId = pollId ?? list.picked?.id ?? null;
  const detail = usePoll(tripId, targetId);
  const [sheetOpen, setSheetOpen] = useState(false);

  const poll: Poll | null = detail.data ?? (pollId ? null : list.picked);
  const members = (trip.data?.members ?? []).filter((m) => m.status === 'ACTIVE');

  const onOpened = (opened: Poll) => {
    router.replace({
      pathname: '/trips/[tripId]/polls/[pollId]',
      params: { tripId, pollId: opened.id },
    });
  };

  let body;
  if ((!pollId && list.isPending) || (targetId && detail.isPending && !poll)) {
    body = <ActivityIndicator style={styles.loading} color={colors.brand.primary} />;
  } else if (detail.notFound) {
    body = (
      <ErrorState title="볼 수 없는 투표예요" onRetry={() => router.back()} retryLabel="뒤로" />
    );
  } else if (!poll && (list.isError || detail.isError)) {
    body = (
      <ErrorState
        onRetry={() => {
          void list.refetch();
          void detail.refetch();
        }}
      />
    );
  } else if (!poll) {
    body = <PollEmptyView onPick={() => setSheetOpen(true)} />;
  } else {
    body = (
      <View style={styles.content}>
        <Text style={typography.title1}>{poll.title}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title={pollTypeLabel(poll?.type ?? null)}
        subtitle={trip.data?.title}
        subtitleIcon="trip"
        right={
          members.length > 0 ? (
            <AvatarGroup
              people={members.map((m) => ({
                name: m.user.nickname,
                imageUrl: m.user.profileImageUrl,
              }))}
              max={3}
            />
          ) : undefined
        }
      />
      {body}
      <OpenPollSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        tripId={tripId}
        onOpened={onOpened}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { marginTop: spacing[32] },
  content: { paddingHorizontal: spacing[20], paddingTop: spacing[16] },
});
