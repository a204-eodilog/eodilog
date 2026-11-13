import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

import { errorLook } from '@/api/error-look';
import { AvatarGroup, Button, Header, Icon, toast } from '@/components/ui';
import { dayCount, dayLegs, toDraft } from '@/features/course/course-rules';
import { useItinerary } from '@/features/course/hooks/use-itinerary';
import { useTrip } from '@/features/trip/hooks/use-trip';
import { useMe } from '@/hooks/use-me';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { ProposalCompare } from '../components/proposal-compare';
import { ProposalFail, ProposalUnsupported } from '../components/proposal-fail';
import { useProposal, type ProposalSource } from '../hooks/use-proposal';
import {
  basisLine,
  compareDay,
  compareRows,
  proposalDraft,
  stats,
  summary,
} from '../proposal-rules';

export type ProposalViewProps = {
  tripTitle?: string;
  people: { name: string; imageUrl?: string | null; me?: boolean }[];
  state: 'loading' | 'compare' | 'failed' | 'unsupported' | 'courseFailed';
  /** 비교 화면 */
  compare?: ReactNode;
  onRetry(): void;
  onCourse(): void;
  /** 지금 코스를 받지 못한 원인. 아이콘과 짧은 제목을 고른다 */
  error?: unknown;
  /** 장소 빼기를 서버가 아직 받지 않을 때 코스 편집으로 */
  onEdit?(): void;
};

/** S29 AI 변경안 표시만. 미리보기와 테스트가 서버 없이 그린다 */
export function ProposalView(props: ProposalViewProps) {
  let body: ReactNode;
  if (props.state === 'loading') {
    body = (
      <View style={styles.center}>
        <Spinner color={colors.brand.primary} />
        <Text style={[typography.body, styles.sub]}>변경안을 만들고 있어요</Text>
      </View>
    );
  } else if (props.state === 'failed') {
    body = <ProposalFail onRetry={props.onRetry} onCourse={props.onCourse} />;
  } else if (props.state === 'courseFailed') {
    body = (
      <ProposalFail onRetry={props.onRetry} onCourse={props.onCourse} {...errorLook(props.error)} />
    );
  } else if (props.state === 'unsupported') {
    body = (
      <ProposalUnsupported onEdit={props.onEdit ?? props.onCourse} onCourse={props.onCourse} />
    );
  } else {
    body = props.compare;
  }
  return (
    <View style={styles.screen}>
      <Header
        title="AI 변경안"
        subtitle={props.tripTitle}
        subtitleIcon="trip"
        right={props.people.length > 0 ? <AvatarGroup people={props.people} max={3} /> : undefined}
      />
      {body}
    </View>
  );
}

/** 적용 충돌 안내(Q-11-5). 장소 빼기면 [다시 만들기], 아니면 [코스 보기] */
export function ConflictNotice(props: {
  canRecreate: boolean;
  onRecreate(): void;
  onCourse(): void;
}) {
  return (
    <View style={styles.notice}>
      <View
        style={styles.noticeIcon}
        accessible
        accessibilityRole="alert"
        accessibilityLabel="그 사이 코스가 바뀌어 적용하지 못했어요"
      >
        <Icon name="people" size={20} color={colors.status.danger} />
      </View>
      <Button
        size="sm"
        variant="secondary"
        label={props.canRecreate ? '다시 만들기' : '코스 보기'}
        icon={props.canRecreate ? 'refresh' : 'route'}
        onPress={props.canRecreate ? props.onRecreate : props.onCourse}
      />
    </View>
  );
}

/** S29 AI 변경안. S24 [빼기]는 removePlaceId로, S26 [변경안 보기]는 jobId로 연다 */
export function ProposalScreen() {
  const params = useLocalSearchParams<{ tripId: string; jobId?: string; removePlaceId?: string }>();
  const tripId = params.tripId;
  const source: ProposalSource = params.removePlaceId
    ? { removePlaceId: params.removePlaceId }
    : { jobId: params.jobId ?? '' };
  const trip = useTrip(tripId);
  const me = useMe();
  const itinerary = useItinerary(tripId);
  const p = useProposal(tripId, source);
  const [conflict, setConflict] = useState(false);

  const begin = p.start;
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void begin();
  }, [begin]);

  const toCourse = () => router.replace(`/trips/${tripId}/course` as Href);
  const people = (trip.data?.members ?? [])
    .filter((m) => m.status === 'ACTIVE')
    .map((m) => ({
      name: m.user.nickname,
      imageUrl: m.user.profileImageUrl,
      me: m.user.id === me.data?.id,
    }));

  let compare: ReactNode = null;
  if (p.proposal?.proposed && itinerary.data) {
    const days = dayCount(trip.data?.startDate ?? null, trip.data?.endDate ?? null);
    const current = toDraft(itinerary.data, days);
    const proposed = proposalDraft(p.proposal.proposed, p.proposal.baseVersion, days);
    const day = compareDay(current, proposed);
    const { rows, removed } = compareRows(current.days[day] ?? [], proposed.days[day] ?? []);
    const head = summary(current, proposed, p.proposal.diff?.description ?? null);
    const before = current.days.flat();
    const after = proposed.days.flat();
    const added = after.some((a) => !before.some((b) => b.place.id === a.place.id));
    const gone = before.some((b) => !after.some((a) => a.place.id === b.place.id));

    const apply = async () => {
      setConflict(false);
      const result = await p.apply();
      if (result === 'applied') {
        router.replace(`/trips/${tripId}/course?applied=${p.jobId ?? ''}` as Href);
      } else if (result === 'conflict') {
        setConflict(true);
      } else if (result === 'unschedulable') {
        toast.error('이 대안은 코스에 넣을 수 없어요');
      } else if (result === 'alreadyApplied') {
        // 다시 눌러도 같으므로 바뀐 지금 코스를 보여 준다
        toast.show('이미 적용한 변경안이에요');
        toCourse();
      } else if (result === 'notReady') {
        toast.show('변경안이 아직 준비되지 않았어요. 잠시 뒤 다시 시도해 주세요');
      } else if (result === 'gone') {
        toast.error('변경안을 찾을 수 없어요');
        toCourse();
      } else if (result === 'failed') {
        toast.error('적용하지 못했어요. 다시 시도해 주세요');
      }
    };

    compare = (
      <ProposalCompare
        summary={head}
        summaryIcon={added ? 'refresh' : gone ? 'close' : 'clock'}
        stats={stats(current.days[day] ?? [], dayLegs(current, day), proposed.days[day] ?? [])}
        basis={basisLine(proposed, p.proposal.job.finishedAt)}
        items={proposed.days[day] ?? []}
        legs={dayLegs(proposed, day)}
        rows={rows}
        removed={removed}
        applying={p.applying}
        onApply={() => void apply()}
        onSkip={() => router.back()}
        notice={
          conflict ? (
            <ConflictNotice
              canRecreate={p.canRecreate}
              onRecreate={() => {
                setConflict(false);
                void begin();
              }}
              onCourse={toCourse}
            />
          ) : undefined
        }
      />
    );
  }

  // 변경안은 끝났는데 지금 코스를 받지 못했으면 기다림이 아니라 실패로 보인다
  const courseFailed = p.phase === 'done' && !itinerary.data && itinerary.isError;
  const state =
    p.phase === 'failed' || p.phase === 'unsupported'
      ? p.phase
      : courseFailed
        ? 'courseFailed'
        : p.phase === 'done' && compare
          ? 'compare'
          : 'loading';

  return (
    <ProposalView
      tripTitle={trip.data?.title}
      people={people}
      state={state}
      error={itinerary.error}
      compare={compare}
      onRetry={() => {
        if (courseFailed) void itinerary.refetch();
        else void begin();
      }}
      onCourse={toCourse}
      onEdit={() => router.replace(`/trips/${tripId}/course/edit` as Href)}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[12] },
  sub: { color: colors.text.icon },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    marginHorizontal: layout.screenPaddingX,
    padding: spacing[14],
    borderRadius: radius.lg,
    backgroundColor: colors.status.dangerBg,
  },
  noticeIcon: { flex: 1 },
});
