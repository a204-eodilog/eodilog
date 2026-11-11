import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, Icon, OfflineNotice } from '@/components/ui';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { TripCard } from '../components/trip-card';
import { TripRow } from '../components/trip-row';
import { UpcomingTripCard } from '../components/upcoming-trip-card';
import { useMyTrips } from '../hooks/use-my-trips';
import { visibleNextTrips } from '../trip-list-rules';
import type { Trip } from '../types';

const openTrip = (trip: Trip) =>
  router.push({ pathname: '/trips/[tripId]', params: { tripId: trip.id } });
const openNew = () => router.push('/trips/new');

/**
 * S15 여행 목록(B안 "지금 여행 집중", 2026-11-05 사용자 선택).
 * - 맨 위: 여행 중 → 다가오는 여행을 상단 바까지 덮는 파랑 블록으로 크게 보인다
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
  // 다음 계획이 3개를 넘으면 접어 둔다. 펼친 것은 이 탭을 보는 동안만 기억한다
  const [nextExpanded, setNextExpanded] = useState(false);

  const sections = listState.kind === 'ready' ? listState.sections : null;
  const featured = sections?.featured ?? null;
  const onBrand = !!featured;

  // 탭에 돌아오면 다시 받는다(만든 여행·다른 기기에서 나간 여행 반영). 진행 중인 요청은 끊지 않고 그 결과를 쓴다
  useFocusEffect(
    useCallback(() => {
      refetch({ cancelRefetch: false });
    }, [refetch]),
  );

  // 파랑 블록이 상단 바 밑까지 올라가므로, 이 탭을 보는 동안만 상단 바 글자를 흰색으로 바꾼다
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(onBrand ? 'light' : 'dark');
      return () => setStatusBarStyle('dark');
    }, [onBrand]),
  );

  const header = (
    <View style={styles.header}>
      <Text style={[typography.title1, onBrand ? styles.headingOnBrand : styles.heading]}>
        여행
      </Text>
      {/* 글 버튼 대신 더하기 아이콘(2026-11-05 사용자 요청: 글보다 아이콘) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="새 여행"
        onPress={openNew}
        hitSlop={spacing[4]}
        style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
      >
        <Icon name="plus" size={26} color={onBrand ? colors.text.inverse : colors.text.default} />
      </Pressable>
    </View>
  );

  if (!sections || (!featured && sections.next.length === 0 && sections.past.length === 0)) {
    let body;
    if (listState.kind === 'loading') {
      body = <Spinner style={styles.loading} color={colors.brand.primary} />;
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
        <View style={styles.flex}>{body}</View>
      </View>
    );
  }

  const stale = listState.kind === 'ready' && listState.stale;
  const next = visibleNextTrips(sections.next, nextExpanded);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing[32] }]}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={onPullRefresh}
            tintColor={onBrand ? colors.text.inverse : undefined}
            progressViewOffset={insets.top}
          />
        }
      >
        {featured ? (
          <View style={[styles.brand, { paddingTop: insets.top }]}>
            {header}
            <UpcomingTripCard trip={featured} today={today} onPress={() => openTrip(featured)} />
          </View>
        ) : (
          <View style={{ paddingTop: insets.top }}>{header}</View>
        )}

        {stale ? (
          <View style={styles.offline}>
            <Icon name="alert" size={16} color={colors.status.warning} />
            <Text style={[typography.caption, styles.offlineText]}>연결이 불안정해요</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="다시 불러오기"
              onPress={() => refetch()}
              hitSlop={spacing[8]}
            >
              <Icon name="refresh" size={18} color={colors.status.warning} />
            </Pressable>
          </View>
        ) : null}

        {sections.next.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle title="다음 계획" count={sections.next.length} />
            <View>
              {next.shown.map((trip, i) => (
                <View key={trip.id}>
                  {i > 0 ? <View style={styles.divider} /> : null}
                  <TripRow trip={trip} kind="next" today={today} onPress={() => openTrip(trip)} />
                </View>
              ))}
            </View>
            {next.canToggle ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  nextExpanded ? '다음 계획 접기' : `다음 계획 ${next.hiddenCount}개 더 보기`
                }
                onPress={() => setNextExpanded((v) => !v)}
                style={({ pressed }) => [styles.more, pressed && styles.pressed]}
              >
                <Text style={[typography.bodyMedium, styles.moreLabel]}>
                  {nextExpanded ? '접기' : `더 보기 ${next.hiddenCount}`}
                </Text>
                <Icon
                  name={nextExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.text.icon}
                />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {sections.past.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle title="다녀온 여행" count={sections.past.length} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cardRow}
            >
              {sections.past.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  kind="past"
                  today={today}
                  onPress={() => openTrip(trip)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={[typography.title3, styles.heading]}>{title}</Text>
      <Text style={[typography.bodyBold, styles.count]}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  brand: { backgroundColor: colors.brand.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // 상단 바: 높이 56, 좌우 20, 제목 23
    paddingHorizontal: layout.screenPaddingX,
    height: 56,
  },
  heading: { color: colors.text.default },
  headingOnBrand: { color: colors.text.inverse },
  // 누르는 칸 44. 아이콘 오른쪽 끝이 아래 내용 오른쪽 끝과 맞도록 칸 여백만큼 밖으로 뺀다
  newButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    marginRight: -(layout.minTouchTarget - 26) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  // 로딩 동그라미를 남은 화면의 정중앙에 둔다
  loading: { flex: 1 },
  section: { paddingTop: spacing[28], gap: spacing[12] },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    paddingHorizontal: layout.screenPaddingX,
  },
  count: { color: colors.brand.primary },
  cardRow: { paddingHorizontal: layout.screenPaddingX, gap: spacing[10] },
  // 더 보기·접기. 누르는 칸 44
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[4],
    minHeight: layout.minTouchTarget,
    marginHorizontal: layout.screenPaddingX,
  },
  moreLabel: { color: colors.text.icon },
  // 줄 사이 선은 이름 글자 시작에 맞춘다(화면 여백 20 + 달력 칸 48 + 간격 14)
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: layout.screenPaddingX + 48 + spacing[14],
    marginRight: layout.screenPaddingX,
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
