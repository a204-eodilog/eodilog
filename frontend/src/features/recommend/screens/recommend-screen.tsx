import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, Header, Icon, toast } from '@/components/ui';
import { isMine } from '@/features/group-favorites/group-rules';
import { useFavoriteMutations } from '@/features/group-favorites/hooks/use-favorite-mutations';
import { useGroupFavorites } from '@/features/group-favorites/hooks/use-group-favorites';
import { getPreferences } from '@/features/preferences/api';
import { useRegions } from '@/features/trip/hooks/use-region-names';
import { useTrip } from '@/features/trip/hooks/use-trip';
import { shortRegionName } from '@/features/trip/trip-rules';
import { useMe } from '@/hooks/use-me';
import { formatPeriodShort } from '@/lib/format-date';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { BasisCard } from '../components/basis-card';
import { RecommendCard } from '../components/recommend-card';
import { RecommendLoading } from '../components/recommend-loading';
import {
  InsufficientView,
  NoOverlapNotice,
  RecommendFailView,
} from '../components/recommend-states';
import { useRecommendation } from '../hooks/use-recommendation';
import {
  basisCells,
  insufficientLines,
  splitItems,
  viewState,
  type BasisCell,
  type PlacePick,
  type RegionPick,
  type ViewState,
} from '../recommend-rules';

export type RecommendViewProps = {
  state: ViewState;
  /** 생성 중 */
  startedAt: number | null;
  progress: number;
  placeCount: number;
  peopleCount: number;
  /** 결과 */
  regions: RegionPick[];
  places: PlacePick[];
  cells: BasisCell[];
  /** 여행지 카드의 지역 줄. 응답 Region에 상위 지역 이름이 없어 여행의 여행지 이름을 쓴다 */
  regionLocation: string | null;
  /** 내가 이미 담은 장소 */
  savedIds: ReadonlySet<string>;
  savingId: string | null;
  onSave(placeId: string): void;
  onVote(pick: RegionPick): void;
  onRedo(): void;
  /** 자료 부족·실패·겹침 없음처럼 결과 대신 보이는 화면 */
  other?: ReactNode;
  /** 결과 위에 덧붙이는 안내(겹침 없음) */
  notice?: ReactNode;
};

/** S21 추천 결과 표시만. 미리보기와 테스트가 서버 없이 그린다 */
export function RecommendView(props: RecommendViewProps) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollViewInstance>(null);
  const [offsets, setOffsets] = useState({ regions: 0, places: 0 });
  const [section, setSection] = useState<'regions' | 'places'>('regions');
  const ready = props.state === 'success' || props.state === 'noOverlap';

  const jump = (key: 'regions' | 'places') => {
    setSection(key);
    scroll.current?.scrollTo({ y: Math.max(0, offsets[key] - spacing[8]), animated: true });
  };

  let body: ReactNode;
  if (props.state === 'loading') {
    body = (
      <RecommendLoading
        startedAt={props.startedAt}
        progress={props.progress}
        placeCount={props.placeCount}
        peopleCount={props.peopleCount}
      />
    );
  } else if (!ready) {
    body = props.other ?? null;
  } else {
    body = (
      <>
        <View style={styles.tabs}>
          {props.regions.length > 0 ? (
            <Chip
              size="sm"
              label={`여행지 ${props.regions.length}`}
              selected={section === 'regions'}
              onPress={() => jump('regions')}
            />
          ) : null}
          {props.places.length > 0 ? (
            <Chip
              size="sm"
              label={`맛집과 스팟 ${props.places.length}`}
              selected={section === 'places' || props.regions.length === 0}
              onPress={() => jump('places')}
            />
          ) : null}
        </View>
        <ScrollView
          ref={scroll}
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
          testID="recommend-list"
        >
          {props.notice ?? <BasisCard cells={props.cells} />}
          {props.regions.length > 0 ? (
            <View
              style={styles.section}
              onLayout={(e) => {
                const y = e.nativeEvent.layout.y;
                setOffsets((o) => ({ ...o, regions: y }));
              }}
            >
              <View style={styles.sectionHead}>
                <Text style={[typography.title3, styles.sectionTitle]}>여행지 추천</Text>
                <Text style={[typography.caption, styles.sectionHint]}>투표 후보로 올려요</Text>
              </View>
              {props.regions.map((r) => (
                <RecommendCard
                  key={r.region.id}
                  title={r.region.name}
                  location={props.regionLocation}
                  reason={r.reason}
                  reasonIcon="bookmark"
                  action={{ kind: 'vote', onPress: () => props.onVote(r) }}
                />
              ))}
            </View>
          ) : null}
          {props.places.length > 0 ? (
            <View
              style={styles.section}
              onLayout={(e) => {
                const y = e.nativeEvent.layout.y;
                setOffsets((o) => ({ ...o, places: y }));
              }}
            >
              <Text style={[typography.title3, styles.sectionTitle]}>맛집과 스팟</Text>
              {props.places.map((p) => (
                <RecommendCard
                  key={p.place.id}
                  title={p.place.name}
                  location={p.place.address}
                  reason={p.reason}
                  reasonIcon="people"
                  action={{
                    kind: 'save',
                    saved: props.savedIds.has(p.place.id),
                    busy: props.savingId === p.place.id,
                    onPress: () => props.onSave(p.place.id),
                  }}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
        <Pressable
          style={[styles.redo, { bottom: insets.bottom + spacing[16] }]}
          onPress={props.onRedo}
          accessibilityRole="button"
        >
          <Icon name="refresh" size={18} color={colors.text.default} />
          <Text style={[typography.bodyMedium, styles.redoText]}>재추천</Text>
        </Pressable>
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <Header title="추천" onBack={() => router.back()} />
      {body}
    </View>
  );
}

/** S21 추천 결과. S20 [추천 받기]와 S17 '추천'에서 연다 */
export function RecommendScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const trip = useTrip(tripId);
  const me = useMe();
  const rec = useRecommendation(tripId);
  const group = useGroupFavorites(tripId, { filter: 'ALL', memberId: null });
  const mutations = useFavoriteMutations(tripId);
  const regionIds = trip.data?.destinationRegionIds ?? [];
  const { regions } = useRegions(regionIds.slice(0, 1));
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  const start = rec.start;
  /** 처음 시작(취향 확인 포함)을 마쳤는지 */
  const started = useRef(false);
  /** 취향 입력에 다녀오면 다시 추천한다 */
  const restartOnFocus = useRef(false);
  const toPreferences = () => {
    restartOnFocus.current = true;
    router.push({ pathname: '/preferences', params: { from: 'recommendation', tripId } });
  };
  // 내 취향이 비었으면 먼저 취향 입력(S03 추천 직전)으로 보내고, 돌아와 화면이 다시 보이면 시작한다(Q-9-6).
  // 콜백은 바뀌지 않게 두어 화면이 다시 보일 때만 돈다
  useFocusEffect(
    useCallback(() => {
      if (started.current && !restartOnFocus.current) return;
      let cancelled = false;
      void (async () => {
        if (!started.current) {
          // 취향을 받지 못하면 묻지 않고 시작한다
          const prefs = await getPreferences().catch(() => undefined);
          if (cancelled) return;
          started.current = true;
          const empty =
            prefs === null ||
            (prefs !== undefined &&
              prefs.explicitItems.length === 0 &&
              prefs.inferredItems.length === 0);
          if (empty) {
            toPreferences();
            return;
          }
        }
        restartOnFocus.current = false;
        void start();
      })();
      return () => {
        cancelled = true;
      };
      // toPreferences는 ref와 tripId만 써서 다시 만들 필요가 없다
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [start, tripId]),
  );

  const members = (trip.data?.members ?? []).filter((m) => m.status === 'ACTIVE');
  const myMemberId = members.find((m) => m.user.id === me.data?.id)?.id ?? null;
  const overlap = group.totals?.overlapPlaceCount ?? null;
  const result = rec.result;
  const { regions: regionPicks, places } = splitItems(result?.items ?? []);
  const state = viewState(rec.phase === 'idle' ? null : result, rec.phase === 'failed', overlap);
  const savedIds = new Set([
    ...group.items.filter((i) => isMine(i, myMemberId)).map((i) => i.place.id),
    ...addedIds,
  ]);
  const regionName = regions[0] ? shortRegionName(regions[0].name) : null;

  const save = async (placeId: string) => {
    setSavingId(placeId);
    const done = await mutations.add([placeId]);
    setSavingId(null);
    if (done > 0) setAddedIds(new Set([...addedIds, placeId]));
  };

  return (
    <RecommendView
      state={rec.phase === 'running' ? 'loading' : state}
      startedAt={rec.startedAt}
      progress={result?.job.progress ?? 0}
      placeCount={group.totals?.allPlaceCount ?? 0}
      peopleCount={members.length}
      regions={regionPicks}
      places={places}
      cells={
        result
          ? basisCells(
              result.basis,
              overlap,
              regionName,
              formatPeriodShort(trip.data?.startDate ?? null, trip.data?.endDate ?? null),
            )
          : []
      }
      regionLocation={regionName}
      savedIds={savedIds}
      savingId={savingId}
      onSave={(id) => void save(id)}
      // 투표 열기 시트는 투표 쪽 작업과 합칠 때 그 여행지로 연다(Q-9-2)
      onVote={() => toast.show('준비 중이에요')}
      onRedo={() => void start()}
      notice={state === 'noOverlap' ? <NoOverlapNotice /> : undefined}
      other={
        state === 'insufficient' && result ? (
          <InsufficientView
            lines={insufficientLines(result.basis)}
            // 그룹 즐겨찾기에서 왔으면 그리로 돌아가고, 아니면 연다
            onMorePlaces={() => router.dismissTo(`/trips/${tripId}/favorites`)}
            // 취향을 넣고 돌아오면 다시 추천한다
            onPreferences={toPreferences}
          />
        ) : state === 'failed' ? (
          <RecommendFailView onRetry={() => void start()} />
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  tabs: {
    flexDirection: 'row',
    gap: spacing[10],
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[4],
    paddingBottom: spacing[12],
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: layout.screenPaddingX, gap: spacing[28] },
  section: { gap: spacing[12] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text.default },
  sectionHint: { color: colors.text.icon },
  redo: {
    position: 'absolute',
    right: layout.screenPaddingX,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    height: 48,
    paddingHorizontal: spacing[18],
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    boxShadow: `0 4px 12px ${colors.shadow}`,
  },
  redoText: { color: colors.text.default },
});
