import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { toApiError } from '@/api/errors';
import { ErrorState, Header, Icon, toast } from '@/components/ui';
import { pickPlace } from '@/features/place/place-picker';
import { getAllBookmarks } from '@/features/saved/api';
import { bookmarkKeys } from '@/features/saved/hooks/use-bookmarks';
import { useTrip } from '@/features/trip/hooks/use-trip';
import { useMe } from '@/hooks/use-me';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { AddPlaceSheet } from '../components/add-place-sheet';
import { BookmarkPickSheet } from '../components/bookmark-pick-sheet';
import { BottomActions } from '../components/bottom-actions';
import { FavoritesEmpty } from '../components/favorites-empty';
import { FavoritesMap } from '../components/favorites-map';
import { FilterBar } from '../components/filter-bar';
import { InCourseConfirm } from '../components/in-course-confirm';
import { MemberFilterSheet } from '../components/member-filter-sheet';
import { PlaceRow } from '../components/place-row';
import { PlaceSheet } from '../components/place-sheet';
import { useCoursePlaces } from '../hooks/use-course-places';
import { useFavoriteMutations } from '../hooks/use-favorite-mutations';
import { useGroupFavorites } from '../hooks/use-group-favorites';
import { isMine } from '../group-rules';
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
  } else if (items.length === 0) {
    // 거른 결과만 없을 때(겹친 곳 0, 그 동행이 담은 곳 0)
    body = (
      <Text style={[typography.body, styles.none]}>
        {props.filter === 'OVERLAP' ? '겹친 곳이 아직 없어요' : '이 동행이 담은 곳이 없어요'}
      </Text>
    );
  } else if (props.view === 'map') {
    body = (
      <FavoritesMap
        items={items}
        members={members}
        selectedId={props.mapSelected}
        onSelect={props.onMapSelect}
        onOpen={props.onOpen}
        picked={props.selecting}
      />
    );
  } else {
    body = (
      <FlatList
        testID="favorites-list"
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
  // 장소가 하나도 없으면 빈 화면이 버튼을 갖고 있어 아래 줄을 숨긴다(Figma 201-9686)
  const showBottom = ready && !(items.length === 0 && props.empty);
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
      {showBottom ? (
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
  const mutations = useFavoriteMutations(tripId);
  const course = useCoursePlaces(tripId);
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // 투표 후보 고르기 모드. null이면 평소 화면
  const [selecting, setSelecting] = useState<Set<string> | null>(null);
  /** 코스에 든 장소를 빼려 할 때 그 장소와 코스를 고친 동행 */
  const [confirm, setConfirm] = useState<{ placeId: string; editor: string } | null>(null);
  // 개인 즐겨찾기는 고르기 시트를 열 때만 받는다(개인 즐겨찾기 화면과 같은 캐시)
  const bookmarks = useQuery({
    queryKey: bookmarkKeys.all,
    queryFn: getAllBookmarks,
    enabled: picking,
  });

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
  const myMemberId = people.find((p) => p.me)?.id ?? null;
  const openItem = list.items.find((i) => i.place.id === openId) ?? null;
  const nameOf = (memberId: string | null) => people.find((p) => p.id === memberId)?.name ?? '동행';

  const search = async () => {
    setAdding(false);
    const picked = await pickPlace({ regionId: trip.data?.destinationRegionIds?.[0] });
    if (picked) await mutations.add([picked.id]);
  };

  const removeMine = (placeId: string) => {
    setOpenId(null);
    // 코스에 든 장소면 빼기 전에 확인한다(Figma 201-29151)
    if (course.data?.placeIds.has(placeId)) {
      setConfirm({ placeId, editor: nameOf(course.data.updatedByMemberId) });
      return;
    }
    void mutations.remove(placeId);
  };

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
      onOpen={(item) => {
        if (!selecting) return setOpenId(item.place.id);
        const next = new Set(selecting);
        if (next.has(item.place.id)) next.delete(item.place.id);
        else next.add(item.place.id);
        setSelecting(next);
      }}
      mapSelected={mapSelected}
      onMapSelect={setMapSelected}
      selecting={selecting}
      onAdd={() => setAdding(true)}
      onPoll={() => {
        // 체크 상자는 목록에서만 보여 지도에서 눌러도 목록으로 돌아온다
        setView('list');
        setSelecting(new Set());
      }}
      onRecommend={notReady}
      onCancelSelect={() => setSelecting(null)}
      // 투표 열기 시트는 투표 쪽 작업과 합칠 때 고른 장소로 연다. 그 전까지는 안내만 띄우고 고른 것은 둔다
      onConfirmSelect={notReady}
      onRetry={() => void list.refetch()}
      empty={
        list.totals?.allPlaceCount === 0 ? (
          <FavoritesEmpty onAdd={() => setAdding(true)} onRecommend={notReady} />
        ) : undefined
      }
    >
      <MemberFilterSheet
        visible={memberSheet}
        onClose={() => setMemberSheet(false)}
        members={people}
        value={memberFilter}
        onChange={setMemberFilter}
      />
      <AddPlaceSheet
        visible={adding}
        onClose={() => setAdding(false)}
        tripTitle={trip.data?.title}
        onBookmarks={() => {
          setAdding(false);
          setPicking(true);
        }}
        // S11 링크·캡처 등록은 FE B 담당이라 아직 없다(가정 Q-7-1)
        onLink={notReady}
        onSearch={() => void search()}
      />
      <BookmarkPickSheet
        visible={picking}
        onClose={() => setPicking(false)}
        bookmarks={bookmarks.data}
        // 동행만 담은 장소는 내가 더 담아 겹치게 할 수 있어 내가 담은 장소만 막는다
        inGroup={new Set(list.items.filter((i) => isMine(i, myMemberId)).map((i) => i.place.id))}
        busy={mutations.busy}
        onConfirm={(ids) =>
          void mutations.add(ids).then((n) => {
            if (n > 0) setPicking(false);
          })
        }
      />
      <PlaceSheet
        item={openItem}
        members={people}
        myMemberId={myMemberId}
        onClose={() => setOpenId(null)}
        busy={mutations.busy}
        onSaveMemo={(memo) => {
          if (openItem) void mutations.saveMemo(openItem.place.id, memo);
        }}
        onAdd={() => {
          if (openItem) void mutations.add([openItem.place.id]).then(() => setOpenId(null));
        }}
        onRemove={() => openItem && removeMine(openItem.place.id)}
      />
      <InCourseConfirm
        editor={confirm?.editor ?? null}
        onRemoveAnyway={() => {
          if (confirm) void mutations.remove(confirm.placeId);
          setConfirm(null);
        }}
        onRefresh={() => {
          setConfirm(null);
          void list.refetch();
          void course.refetch();
        }}
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
  none: { color: colors.text.sub, textAlign: 'center', marginTop: spacing[32] },
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
