import { SCROLL_DECELERATION } from '@/theme/scroll';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, Icon, OfflineNotice } from '@/components/ui';
import { FadeIn } from '@/components/ui/fade-in';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SkeletonList } from '@/components/ui/skeleton';
import { ReceivedInvitationsBanner } from '@/features/invitation/components/received-invitations-banner';
import { voiceTripAvailable } from '@/features/voice-trip/api';
import { NewTripChoiceSheet } from '@/features/voice-trip/components/new-trip-choice-sheet';
import { VoiceTripBanner } from '@/features/voice-trip/components/voice-trip-banner';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { TripRow } from '../components/trip-row';
import { UpcomingTripCard } from '../components/upcoming-trip-card';
import { useMyTrips } from '../hooks/use-my-trips';
import { visibleNextTrips } from '../trip-list-rules';
import type { Trip } from '../types';

const openTrip = (trip: Trip) =>
  router.push({ pathname: '/trips/[tripId]', params: { tripId: trip.id } });
const openNewDirect = () => router.push('/trips/new');

/**
 * S15 여행 목록(B안 "지금 여행 집중", 2026-11-05 사용자 선택).
 * - 맨 위: 채팅 탭과 같은 밝은 상단 바("여행" + "+ 새 여행") 아래에,
 *   여행 중 → 다가오는 여행을 따로 떨어진 파랑 카드로 크게 보인다
 * - 다음 계획: 파랑 달력 칸의 세로 목록. 가까운 순으로 3개까지 보이고 더 있으면 "더 보기"로 펼친다
 * - 다녀온 여행: 회색 달력 칸의 옆으로 넘기는 카드
 *   (2026-11-11 사용자 결정으로 두 묶음의 모양을 맞바꿨다. 앞으로 할 일이 한눈에 보이게)
 * 한 사람의 여행 수는 많지 않아 가상 목록 없이 한 번에 그린다
 */
export function TripListScreen() {
  const insets = useSafeAreaInsets();
  const { listState, today, refetch } = useMyTrips();
  // 당겨서 새로고침 표시는 사람이 당겼을 때만 켠다. 탭 복귀·앱 복귀 때 조용히 다시 받는 동안에는
  // 화면 위 동그라미(RefreshControl)를 띄우지 않는다
  const { refreshing: pulling, onRefresh: onPullRefresh } = usePullRefresh(refetch);
  // [+ 새 여행]에서 말로 만들지, 직접 입력할지 고른다(테스트 모드에는 말로 만들기 API가 없어 바로 입력 화면)
  const [choosing, setChoosing] = useState(false);
  const openNew = () => (voiceTripAvailable() ? setChoosing(true) : openNewDirect());
  // 다음 계획이 3개를 넘으면 접어 둔다. 펼친 것은 이 탭을 보는 동안만 기억한다

  const sections = listState.kind === 'ready' ? listState.sections : null;
  const featured = sections?.featured ?? null;
  const noTrips =
    !!sections && !featured && sections.next.length === 0 && sections.past.length === 0;
  // "+ 새 여행"은 여행이 없으면 가운데 만들기 버튼과 겹쳐 숨긴다. 로딩 중에도 숨겨, 보였다가 사라지며
  // 덜컹이지 않게 한다. 오류·오프라인은 가운데에 다시 시도만 있어 만들기로 가는 길로 남겨 둔다
  const showNew = listState.kind !== 'loading' && !noTrips;

  // 탭에 돌아오면 다시 받는다(만든 여행·다른 기기에서 나간 여행 반영). 진행 중인 요청은 끊지 않고 그 결과를 쓴다
  useFocusEffect(
    useCallback(() => {
      refetch({ cancelRefetch: false });
    }, [refetch]),
  );

  // 상단 바는 채팅 탭처럼 밝은 바탕이라 상태바 글자는 늘 짙게 둔다.
  // 다른 화면(파랑 머리 상세 등)에서 돌아와도 짙은 글자로 되돌린다
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('dark');
    }, []),
  );

  // 채팅 탭과 같은 밝은 상단 바. 로딩·빈 목록·대표 여행 있음 모두 같은 바를 쓴다(높이 56 고정이라 버튼이 없어도 제목 자리는 같다)
  const header = (
    <View style={styles.header}>
      <Text style={[typography.title1, styles.heading]} accessibilityRole="header">
        여행
      </Text>
      {showNew ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="새 여행 만들기"
          onPress={openNew}
          style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
        >
          <View style={styles.newPill}>
            <Icon name="plus" size={16} color={colors.brand.primary} />
            <Text style={[typography.captionMedium, styles.newLabel]}>새 여행</Text>
          </View>
        </PressableScale>
      ) : null}
    </View>
  );

  if (!sections || noTrips) {
    let body;
    if (listState.kind === 'loading') {
      body = <SkeletonList style={styles.loading} />;
    } else if (listState.kind === 'offline') {
      body = <OfflineNotice onRetry={() => refetch()} />;
    } else if (listState.kind === 'error') {
      body = <ErrorState onRetry={() => refetch()} />;
    } else {
      body = (
        <EmptyState
          icon="trip"
          title="아직 여행이 없어요"
          description="새 여행을 만들거나 초대 링크로 참여해요"
          actionLabel="새 여행"
          onAction={openNew}
        />
      );
    }
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {header}
        <VoiceTripBanner />
        <ReceivedInvitationsBanner />
        <View style={styles.flex}>{body}</View>
        <NewTripChoiceSheet visible={choosing} onClose={() => setChoosing(false)} />
      </View>
    );
  }

  const stale = listState.kind === 'ready' && listState.stale;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {header}
      <VoiceTripBanner />
      <ReceivedInvitationsBanner />
      <ScrollView
        decelerationRate={SCROLL_DECELERATION}
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing[32] }]}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPullRefresh} />}
      >
        {featured ? (
          <UpcomingTripCard trip={featured} today={today} onPress={() => openTrip(featured)} />
        ) : null}

        {stale ? (
          <View style={styles.offline}>
            <Icon name="alert" size={16} color={colors.status.warning} />
            <Text style={[typography.caption, styles.offlineText]}>연결이 불안정해요</Text>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="다시 불러오기"
              onPress={() => refetch()}
              hitSlop={spacing[8]}
            >
              <Icon name="refresh" size={18} color={colors.status.warning} />
            </PressableScale>
          </View>
        ) : null}

        {/* 다음 계획과 다녀온 여행은 같은 모양이다: 흰 카드 한 장에 줄로 담고, 많으면 화살표로 접고 편다 */}
        <TripSection
          title="다음 계획"
          kind="next"
          trips={sections.next}
          today={today}
          onOpen={openTrip}
        />
        <TripSection
          title="다녀온 여행"
          kind="past"
          trips={sections.past}
          today={today}
          onOpen={openTrip}
        />
      </ScrollView>
      <NewTripChoiceSheet visible={choosing} onClose={() => setChoosing(false)} />
    </View>
  );
}

/**
 * 여행 목록 한 구역. 제목과 개수, 흰 카드 안의 여행 줄, 줄이 많으면 아래 화살표로 접고 편다.
 * 화살표에는 글자를 두지 않는다(2026-11-13 사용자 결정). 화면 읽어 주기에는 "더 보기"·"접기"로 읽힌다
 */
function TripSection({
  title,
  kind,
  trips,
  today,
  onOpen,
}: {
  title: string;
  kind: 'next' | 'past';
  trips: readonly Trip[];
  today: string;
  onOpen: (trip: Trip) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (trips.length === 0) return null;
  const list = visibleNextTrips(trips, expanded);
  return (
    <View style={styles.section}>
      <SectionTitle title={title} count={trips.length} />
      <View style={styles.listCard}>
        {list.shown.map((trip, i) => (
          <FadeIn key={trip.id} index={i}>
            {i > 0 ? <View style={styles.divider} /> : null}
            <TripRow trip={trip} kind={kind} today={today} onPress={() => onOpen(trip)} />
          </FadeIn>
        ))}
      </View>
      {list.canToggle ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={expanded ? `${title} 접기` : `${title} ${list.hiddenCount}개 더 보기`}
          onPress={() => setExpanded((v) => !v)}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
        >
          <Icon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.text.icon}
          />
        </PressableScale>
      ) : null}
    </View>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={[typography.title2, styles.heading]}>{title}</Text>
      <View style={styles.countPill}>
        <Text style={[typography.captionBold, styles.count]}>{count}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 바탕은 옅은 회색, 내용은 흰 카드에 담는다. 파랑 머리와 카드가 또렷이 나뉜다
  screen: { flex: 1, backgroundColor: colors.surface.subtle },
  flex: { flex: 1 },
  // 상단 바와 첫 내용 사이 8(채팅 탭 목록과 같다)
  content: { flexGrow: 1, paddingTop: spacing[8] },
  listCard: {
    marginHorizontal: spacing[16],
    paddingVertical: spacing[6],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.white,
  },
  countPill: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: spacing[8],
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primaryBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // 상단 바: 높이 56, 좌우 20, 제목 23
    paddingHorizontal: layout.screenPaddingX,
    height: 56,
  },
  heading: { color: colors.text.default },
  // "+ 새 여행" 알약. 보이는 높이 30, 누르는 칸 높이 48(알약 위아래 빈 곳도 누른다)
  newButton: { minHeight: 48, justifyContent: 'center' },
  newPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    height: 30,
    paddingHorizontal: spacing[12],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primaryBg,
  },
  newLabel: { color: colors.brand.primary },
  pressed: { opacity: 0.6 },
  // 로딩 동그라미를 남은 화면의 정중앙에 둔다
  loading: { flex: 1 },
  section: { paddingTop: spacing[24], gap: spacing[12] },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    paddingHorizontal: layout.screenPaddingX,
  },
  count: { color: colors.brand.primary },
  // 더 보기·접기. 누르는 칸 44
  // 접고 펴는 화살표. 글자 없이 동그라미만
  more: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
  },
  // 줄 사이 선은 이름 글자 시작에 맞춘다(화면 여백 20 + 달력 칸 48 + 간격 14)
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing[16] + 48 + spacing[14],
    marginRight: spacing[16],
    backgroundColor: colors.line.strong,
  },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    marginHorizontal: layout.screenPaddingX,
    marginTop: spacing[16],
    padding: spacing[12],
    borderRadius: radius.md,
    backgroundColor: colors.status.warningBg2,
  },
  offlineText: { flex: 1, color: colors.status.warning },
});
