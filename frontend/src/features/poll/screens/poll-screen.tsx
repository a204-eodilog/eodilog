import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AvatarGroup, ErrorState, Header } from '@/components/ui';
import { useTrip } from '@/features/trip/hooks/use-trip';
import { colors, spacing, typography } from '@/theme';

import { useMe } from '@/hooks/use-me';

import { OpenPollSheet } from '../components/open-poll-sheet';
import { PollEmptyView, PollOpenView } from '../components/poll-views';
import { useBallot } from '../hooks/use-ballot';
import { useCandidateNames } from '../hooks/use-candidate-names';
import { usePoll } from '../hooks/use-poll';
import { usePolls } from '../hooks/use-polls';
import { ballotFailLines, pollTypeLabel, pollViewState } from '../poll-rules';
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
  } else if (['open', 'closing'].includes(pollViewState(poll, new Date()))) {
    // 투표마다 저장 큐가 따로라 투표 ID를 키로 준다
    body = <OpenSection key={poll.id} tripId={tripId} poll={poll} />;
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

/** 진행 중 투표: 내 선택 저장과 실패 안내를 붙여 PollOpenView로 그린다 */
function OpenSection({ tripId, poll }: { tripId: string; poll: Poll }) {
  const { data: me } = useMe();
  const ballot = useBallot(tripId, poll);
  const view = ballot.view ?? poll;
  const { names } = useCandidateNames(view.candidates);
  const nameOf = (ids: string[]) => ids.map((id) => names[id]).filter(Boolean);
  // 안내에는 새로 고르려던 곳만 부른다("강릉으로 바꾸지 못했어요"). 빼기만 했으면 고르려던 선택 전체
  const failure = ballot.failure;
  const added = failure?.wanted.filter((id) => !poll.myCandidateIds.includes(id)) ?? [];
  const failLines = failure
    ? ballotFailLines(
        nameOf(added.length > 0 ? added : failure.wanted),
        nameOf(poll.myCandidateIds),
      )
    : null;
  return (
    <PollOpenView
      poll={view}
      names={names}
      myName={me?.nickname ?? '나'}
      now={new Date()}
      failLines={failLines}
      onToggle={ballot.toggle}
      onCancel={ballot.cancel}
      onRetry={ballot.retry}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { marginTop: spacing[32] },
  content: { paddingHorizontal: spacing[20], paddingTop: spacing[16] },
});
