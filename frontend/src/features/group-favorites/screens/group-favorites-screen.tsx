import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { toApiError } from '@/api/errors';
import { ErrorState, Header, Icon, toast } from '@/components/ui';
import { useTrip } from '@/features/trip/hooks/use-trip';
import { useMe } from '@/hooks/use-me';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { BottomActions } from '../components/bottom-actions';
import { FavoritesMap } from '../components/favorites-map';
import { FilterBar } from '../components/filter-bar';
import { MemberFilterSheet } from '../components/member-filter-sheet';
import { PlaceRow } from '../components/place-row';
import { useGroupFavorites } from '../hooks/use-group-favorites';
import type { SavedFilter, SavedPlace, SavedPlacePage } from '../types';

export type Person = { id: string; name: string; imageUrl: string | null; me: boolean };

export type GroupFavoritesViewProps = {
  tripTitle?: string;
  people: Person[];
  status: 'loading' | 'error' | 'notFound' | 'ready';
  view: 'list' | 'map';
  onToggleView(view: 'list' | 'map'): void;
  filter: SavedFilter;
  onFilter(filter: SavedFilter): void;
  totals: SavedPlacePage['totals'] | null;
  items: SavedPlace[];
  onEndReached(): void;
  loadingMore: boolean;
  memberFilter: string | null;
  onMember(): void;
  onOpen(item: SavedPlace): void;
  mapSelected: string | null;
  onMapSelect(placeId: string | null): void;
  /** 후보 고르기 중이면 고른 장소 ID */
  selecting: Set<string> | null;
  onAdd(): void;
  onPoll(): void;
  onRecommend(): void;
  onCancelSelect(): void;
  onConfirmSelect(): void;
  onRetry(): void;
  /** 비었을 때 보일 화면. 다음 단계에서 넘긴다 */
  empty?: ReactNode;
  /** 시트들 */
  children?: ReactNode;
};

/** 목록·지도 바꾸기(Figma 201-9344 머리 오른쪽) */
function ViewToggle({
  view,
  onChange,
}: {
  view: 'list' | 'map';
  onChange(v: 'list' | 'map'): void;
}) {
  return (
    <View style={styles.toggle} accessibilityRole="tablist">
      {(['list', 'map'] as const).map((v) => (
        <Pressable
          key={v}
          style={[styles.toggleItem, view === v && styles.toggleOn]}
          onPress={() => onChange(v)}
          accessibilityRole="tab"
          accessibilityLabel={v === 'list' ? '목록으로 보기' : '지도로 보기'}
          accessibilityState={{ selected: view === v }}
        >
          <Icon
            name={v === 'list' ? 'list' : 'map'}
            size={18}
            color={view === v ? colors.text.default : colors.text.muted}
          />
        </Pressable>
      ))}
    </View>
  );
}

/** S20 그룹 즐겨찾기 모습. 데이터는 화면이나 미리보기가 넘긴다 */
export function GroupFavoritesView(props: GroupFavoritesViewProps) {
  const { people, items } = props;
  const members = people.map((p) => ({ id: p.id, name: p.name, me: p.me }));

  let body: ReactNode;
  if (props.status === 'loading') {
    body = <ActivityIndicator style={styles.loading} color={colors.brand.primary} />;
  } else if (props.status === 'notFound') {
    body = (
      <ErrorState
        title="여행을 찾을 수 없어요"
        description="나갔거나 지워진 여행일 수 있어요"
        retryLabel="돌아가기"
        onRetry={() => router.back()}
      />
    );
  } else if (props.status === 'error') {
    body = <ErrorState title="그룹 즐겨찾기를 불러오지 못했어요" onRetry={props.onRetry} />;
  } else if (items.length === 0 && props.empty) {
    body = props.empty;
  } else if (props.view === 'map') {
    body = (
      <FavoritesMap
        items={items}
        members={members}
        selectedId={props.mapSelected}
        onSelect={props.onMapSelect}
        onOpen={props.onOpen}
      />
    );
  } else {
    body = (
      <FlatList
        data={items}
        keyExtractor={(i) => i.place.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={[typography.caption, styles.order]}>최근 담은 순</Text>}
        renderItem={({ item }) => (
          <PlaceRow
            item={item}
            members={members}
            onPress={props.onOpen}
            selecting={props.selecting !== null}
            selected={props.selecting?.has(item.place.id) ?? false}
          />
        )}
        onEndReached={props.onEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          props.loadingMore ? (
            <ActivityIndicator style={styles.more} color={colors.brand.primary} />
          ) : undefined
        }
      />
    );
  }

  const ready = props.status === 'ready';
  return (
    <View style={styles.screen}>
      <Header
        title="그룹 즐겨찾기"
        subtitle={props.tripTitle}
        subtitleIcon="trip"
        right={<ViewToggle view={props.view} onChange={props.onToggleView} />}
      />
      {ready ? (
        <FilterBar
          filter={props.filter}
          onFilter={props.onFilter}
          allCount={props.totals?.allPlaceCount ?? 0}
          overlapCount={props.totals?.overlapPlaceCount ?? 0}
          people={people.map((p) => ({ name: p.name, imageUrl: p.imageUrl, me: p.me }))}
          memberActive={props.memberFilter !== null}
          onMember={props.onMember}
        />
      ) : null}
      <View style={styles.body}>{body}</View>
      {ready ? (
        props.selecting ? (
          <BottomActions
            mode="selecting"
            count={props.selecting.size}
            onCancel={props.onCancelSelect}
            onConfirm={props.onConfirmSelect}
          />
        ) : (
          <BottomActions
            mode="normal"
            onAdd={props.onAdd}
            onPoll={props.onPoll}
            onRecommend={props.onRecommend}
            pollDisabled={items.length === 0}
          />
        )
      ) : null}
      {props.children}
    </View>
  );
}

/** S20 그룹 즐겨찾기. S17 '즐겨찾기' 메뉴에서 연다 */
export function GroupFavoritesScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const trip = useTrip(tripId);
  const me = useMe();
  const [filter, setFilter] = useState<SavedFilter>('ALL');
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [mapSelected, setMapSelected] = useState<string | null>(null);
  const [memberSheet, setMemberSheet] = useState(false);
  const list = useGroupFavorites(tripId, { filter, memberId: memberFilter });

  const people: Person[] = (trip.data?.members ?? [])
    .filter((m) => m.status === 'ACTIVE')
    .map((m) => ({
      id: m.id,
      name: m.user.nickname,
      imageUrl: m.user.profileImageUrl,
      me: m.user.id === me.data?.id,
    }));

  const notFound = toApiError(list.error).status === 404 || toApiError(trip.error).status === 404;
  const status = notFound ? 'notFound' : list.data ? 'ready' : list.isError ? 'error' : 'loading';

  const notReady = () => toast.show('준비 중이에요');

  return (
    <GroupFavoritesView
      tripTitle={trip.data?.title}
      people={people}
      status={status}
      view={view}
      onToggleView={setView}
      filter={filter}
      onFilter={setFilter}
      totals={list.totals}
      items={list.items}
      onEndReached={() => {
        if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
      }}
      loadingMore={list.isFetchingNextPage}
      memberFilter={memberFilter}
      onMember={() => setMemberSheet(true)}
      onOpen={() => undefined}
      mapSelected={mapSelected}
      onMapSelect={setMapSelected}
      selecting={null}
      onAdd={notReady}
      onPoll={notReady}
      onRecommend={notReady}
      onCancelSelect={() => undefined}
      onConfirmSelect={() => undefined}
      onRetry={() => void list.refetch()}
    >
      <MemberFilterSheet
        visible={memberSheet}
        onClose={() => setMemberSheet(false)}
        members={people}
        value={memberFilter}
        onChange={setMemberFilter}
      />
    </GroupFavoritesView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  body: { flex: 1 },
  loading: { marginTop: spacing[32] },
  list: { paddingHorizontal: layout.screenPaddingX, paddingBottom: spacing[24] },
  order: { color: colors.text.sub, paddingTop: spacing[8], paddingBottom: spacing[4] },
  more: { marginVertical: spacing[16] },
  toggle: {
    flexDirection: 'row',
    padding: spacing[2],
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
  },
  toggleItem: {
    width: 40,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: colors.surface.white },
});
