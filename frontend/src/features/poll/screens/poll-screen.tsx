import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorLook } from '@/api/error-look';
import { AvatarGroup, ErrorState, Header, toast } from '@/components/ui';
import { SkeletonList } from '@/components/ui/skeleton';
import { useTrip } from '@/features/trip/hooks/use-trip';
import { colors } from '@/theme';

import { useMe } from '@/hooks/use-me';

import { AddCandidateSheet } from '../components/add-candidate-sheet';
import { OpenPollSheet } from '../components/open-poll-sheet';
import { PollClosedHeaderCard, PollDecidedCard } from '../components/poll-header-card';
import {
  PollEmptyView,
  PollNoVotesView,
  PollNotFoundView,
  PollOpenView,
  PollResultView,
  TieConfirmedLine,
  type CandidateSources,
} from '../components/poll-views';
import { regionCounts } from '../candidate-options';
import { useOpenPoll } from '../hooks/use-open-poll';
import { useSavedPlaces } from '../hooks/use-saved-places';
import { pollRoutes } from '../poll-routes';
import { useAddCandidates } from '../hooks/use-add-candidates';
import { useBallot } from '../hooks/use-ballot';
import { useCandidateNames } from '../hooks/use-candidate-names';
import { usePoll } from '../hooks/use-poll';
import { usePolls } from '../hooks/use-polls';
import {
  ballotFailLines,
  decidedLines,
  defaultClosesAt,
  notVotedCount,
  notVotedLine,
  pollTypeLabel,
  pollViewState,
  resultHeadline,
  seoulDate,
  seoulDateTime,
  tieLines,
} from '../poll-rules';
import type { CandidateInput, Poll } from '../types';

/**
 * S22 지역·장소 투표. 주소에 투표 ID가 있으면 그 투표를, 없으면 대표 투표를 보인다(research R7).
 * 투표가 없으면 진행 중인 투표 없음과 N8 투표 열기 시트
 */
export function PollScreen() {
  const { tripId, pollId } = useLocalSearchParams<{ tripId: string; pollId?: string }>();
  const trip = useTrip(tripId);
  const list = usePolls(tripId, !pollId);
  // 메뉴로 들어와 처음 고른 투표를 붙잡는다. 앱으로 돌아와 목록을 다시 받을 때 동행이 새 투표를 열었어도
  // 보던 투표가 말없이 바뀌지 않게 한다
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  if (!pollId && pinnedId === null && list.picked) setPinnedId(list.picked.id);
  const targetId = pollId ?? pinnedId ?? list.picked?.id ?? null;
  const detail = usePoll(tripId, targetId);
  const [sheetOpen, setSheetOpen] = useState(false);

  const listed = list.data?.find((p) => p.id === targetId) ?? null;
  const poll: Poll | null = detail.data ?? (pollId ? null : listed);
  const { data: me } = useMe();
  const members = (trip.data?.members ?? []).filter((m) => m.status === 'ACTIVE');

  const onOpened = (opened: Poll) => {
    router.replace({
      pathname: '/trips/[tripId]/polls/[pollId]',
      params: { tripId, pollId: opened.id },
    });
  };

  let body;
  if ((!pollId && list.isPending) || (targetId && detail.isPending && !poll)) {
    body = <SkeletonList style={styles.loading} />;
  } else if (detail.notFound) {
    body = <PollNotFoundView />;
  } else if (!poll && (list.isError || detail.isError)) {
    body = (
      <ErrorState
        {...errorLook(list.error ?? detail.error)}
        description={null}
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
  } else if (pollViewState(poll, new Date()) === 'noVotes') {
    body = <NoVotesSection tripId={tripId} poll={poll} onOpened={onOpened} />;
  } else {
    body = (
      <ResultSection key={poll.id} tripId={tripId} tripTitle={trip.data?.title ?? ''} poll={poll} />
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
              // 나는 연파랑으로 구분한다(Figma 201-10912 머리)
              people={members.map((m) => ({
                name: m.user.nickname,
                imageUrl: m.user.profileImageUrl,
                me: m.user.id === me?.id,
              }))}
              max={3}
            />
          ) : undefined
        }
      />
      {body}
      <OpenPollSheet
        visible={sheetOpen}
        // 진행 중인 투표가 없으면 [투표 열기]가 보인다. 그때 후보 목록을 미리 받는다
        prefetch={!poll}
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
  const add = useAddCandidates(tripId, poll.id);
  const [addOpen, setAddOpen] = useState(false);
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
  const submitAdd = async (inputs: CandidateInput[]) => {
    try {
      const result = await add.mutateAsync(inputs);
      setAddOpen(false);
      if (result.closed) toast.show('투표가 마감됐어요');
      else if (result.skipped > 0) toast.show(`${result.skipped}곳은 이미 후보라 넣지 않았어요`);
    } catch {
      toast.show('후보를 넣지 못했어요. 다시 눌러 주세요');
    }
  };
  return (
    <>
      <PollOpenView
        poll={view}
        names={names}
        myName={me?.nickname ?? '나'}
        now={new Date()}
        failLines={failLines}
        onToggle={ballot.toggle}
        onCancel={ballot.cancel}
        onRetry={ballot.retry}
        onAddCandidate={() => setAddOpen(true)}
      />
      <AddCandidateSheet
        visible={addOpen}
        // 진행 중인 투표에는 [후보 추가]가 늘 보인다
        prefetch
        onClose={() => setAddOpen(false)}
        tripId={tripId}
        poll={poll}
        onSubmit={submitAdd}
        busy={add.isPending}
      />
    </>
  );
}

/** 그룹 즐겨찾기에 담긴 수를 지역 후보 보조 줄로("그룹 즐겨찾기 3곳", Figma 201-11073) */
function useSources(tripId: string, poll: Poll): CandidateSources {
  const saved = useSavedPlaces(tripId, poll.type === 'REGION');
  const counts = new Map(regionCounts(saved.data ?? []).map((r) => [r.regionId, r.count]));
  const sources: CandidateSources = {};
  for (const c of poll.candidates) {
    const n = c.regionId ? counts.get(c.regionId) : undefined;
    if (n) sources[c.id] = { icon: 'bookmark', text: `그룹 즐겨찾기 ${n}곳` };
  }
  return sources;
}

/** 마감 후 자동 확정·여행지 확정·동률(Figma 201-11073·201-11569·201-11213) */
function ResultSection({
  tripId,
  tripTitle,
  poll,
}: {
  tripId: string;
  tripTitle: string;
  poll: Poll;
}) {
  const { names } = useCandidateNames(poll.candidates);
  const sources = useSources(tripId, poll);
  const [showCard, setShowCard] = useState(false);
  const winners = poll.candidates.filter((c) => poll.selectedCandidateIds.includes(c.id));
  const winnerNames = winners.map((c) => names[c.id]);
  const topVotes = Math.max(0, ...winners.map((c) => c.voteCount));
  const isRegion = poll.type === 'REGION';

  if (pollViewState(poll, new Date()) === 'tie') {
    const lines = tieLines(winnerNames);
    return (
      <PollResultView
        poll={poll}
        names={names}
        sources={sources}
        tie
        heading={lines.heading}
        header={
          <PollClosedHeaderCard
            closedAt={seoulDateTime(poll.closesAt)}
            title={resultHeadline('tie', winnerNames, topVotes).title}
            sub={notVotedLine(notVotedCount(poll))}
          />
        }
        between={<TieConfirmedLine text={lines.confirmed} />}
        action={
          isRegion
            ? {
                label: '코스에서 날짜별로 나누기',
                icon: 'check',
                onPress: () => pollRoutes.splitByDay(tripId),
              }
            : undefined
        }
      />
    );
  }

  if (showCard) {
    const lines = decidedLines(poll);
    return (
      <PollResultView
        poll={poll}
        names={names}
        heading="투표 결과"
        showMine={false}
        header={
          <PollDecidedCard
            closedDate={seoulDate(poll.closesAt)}
            label={`${tripTitle} 여행지`}
            name={winnerNames[0] ?? ''}
            votes={lines.votes}
            voters={lines.voters}
          />
        }
        action={{
          label: '장소 모으고 코스 짜기',
          icon: 'route',
          onPress: () => pollRoutes.collectPlaces(tripId),
        }}
      />
    );
  }

  const headline = resultHeadline('decided', winnerNames, topVotes);
  return (
    <PollResultView
      poll={poll}
      names={names}
      sources={sources}
      heading="결과"
      header={
        <PollClosedHeaderCard
          closedAt={seoulDateTime(poll.closesAt)}
          title={headline.title}
          sub={headline.sub}
        />
      }
      action={
        isRegion
          ? { label: '확정된 여행지 보기', icon: 'map-pin', onPress: () => setShowCard(true) }
          : undefined
      }
    />
  );
}

/** 0표(Figma 201-11494). [다시 열기]는 같은 유형·제목·후보로 24시간 뒤 마감인 투표를 새로 연다(FR-019) */
function NoVotesSection({
  tripId,
  poll,
  onOpened,
}: {
  tripId: string;
  poll: Poll;
  onOpened: (poll: Poll) => void;
}) {
  const reopen = useOpenPoll(tripId);
  const submit = () => {
    if (reopen.isPending) return;
    reopen.mutate(
      {
        type: poll.type,
        title: poll.title,
        candidates: poll.candidates.map((c) =>
          c.regionId ? { regionId: c.regionId } : { placeId: c.placeId as string },
        ),
        closesAt: defaultClosesAt(new Date()),
      },
      {
        onSuccess: onOpened,
        onError: () => toast.show('다시 열지 못했어요. 다시 눌러 주세요'),
      },
    );
  };
  return (
    <PollNoVotesView
      onReopen={submit}
      reopening={reopen.isPending}
      onDecide={() => pollRoutes.decideDirectly(tripId)}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  // 로딩 동그라미를 남은 화면의 정중앙에 둔다
  loading: { flex: 1 },
});
