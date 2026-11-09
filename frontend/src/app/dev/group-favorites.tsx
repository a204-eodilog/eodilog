import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { AddPlaceSheet } from '@/features/group-favorites/components/add-place-sheet';
import { FavoritesEmpty } from '@/features/group-favorites/components/favorites-empty';
import { InCourseConfirm } from '@/features/group-favorites/components/in-course-confirm';
import { MemberFilterSheet } from '@/features/group-favorites/components/member-filter-sheet';
import { PlaceSheet } from '@/features/group-favorites/components/place-sheet';
import {
  GroupFavoritesView,
  type Person,
} from '@/features/group-favorites/screens/group-favorites-screen';
import { sampleSaved } from '@/features/group-favorites/testing';
import type { SavedFilter } from '@/features/group-favorites/types';
import { colors, layout, spacing, typography } from '@/theme';

/**
 * 개발용 S20 그룹 즐겨찾기 상태 보기. 서버 없이 GroupFavoritesView에 예시 데이터를 넘겨 그린다.
 * /dev/group-favorites?state=list 처럼 상태를 바로 열 수 있다(contracts/routes.md).
 */

const PEOPLE: Person[] = [
  { id: 'm-seeun', name: '세은', imageUrl: null, me: false },
  { id: 'm-seung', name: '승기', imageUrl: null, me: false },
  { id: 'm-me', name: '영광', imageUrl: null, me: true },
];

const EXAMPLES = [
  { state: 'list', label: '목록 201-9344' },
  { state: 'overlap', label: '겹친 곳만' },
  { state: 'map', label: '지도 보기 201-9521' },
  { state: 'empty', label: '장소 없음 201-9686' },
  { state: 'selecting', label: '투표 후보 고르기' },
  { state: 'add-sheet', label: '장소 추가 시트 201-9751' },
  { state: 'place-sheet', label: '장소 시트' },
  { state: 'in-course', label: '코스에 있는 장소 빼기 201-29151' },
  { state: 'load-error', label: '불러오기 실패' },
];

export default function DevGroupFavorites() {
  const params = useLocalSearchParams<{ state?: string }>();
  const [state, setState] = useState<string | null>(params.state ?? null);

  if (state) return <DevScreen key={state} state={state} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.menu}>
      <Text style={[typography.subBold, styles.heading]}>S20 그룹 즐겨찾기</Text>
      <View style={styles.row}>
        {EXAMPLES.map((e) => (
          <Button
            key={e.state}
            label={e.label}
            size="sm"
            variant="secondary"
            onPress={() => setState(e.state)}
          />
        ))}
      </View>
      <Button label="돌아가기" size="sm" variant="text" onPress={() => router.back()} />
    </ScrollView>
  );
}

/** 미리보기 안에서도 필터·지도·동행 고르기를 눌러 볼 수 있다 */
function DevScreen({ state }: { state: string }) {
  const [filter, setFilter] = useState<SavedFilter>(state === 'overlap' ? 'OVERLAP' : 'ALL');
  const [view, setView] = useState<'list' | 'map'>(state === 'map' ? 'map' : 'list');
  const [member, setMember] = useState<string | null>(null);
  const [memberSheet, setMemberSheet] = useState(false);
  const [mapSelected, setMapSelected] = useState<string | null>(
    state === 'map' ? 'p-haeundae' : null,
  );
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editor, setEditor] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<Set<string> | null>(
    state === 'selecting' ? new Set(['p-haeundae', 'p-gamcheon']) : null,
  );
  // 웹의 아래 시트는 화면이 그려진 뒤에 열어야 올라오는 모습이 보인다
  useEffect(() => {
    const timer = setTimeout(() => {
      if (state === 'add-sheet') setAdding(true);
      if (state === 'place-sheet') setOpenId('p-gamcheon');
      if (state === 'in-course') setEditor('세은');
    }, 300);
    return () => clearTimeout(timer);
  }, [state]);
  const all = state === 'empty' ? [] : sampleSaved();
  const items = all
    .filter((i) => filter === 'ALL' || i.savedCount >= 2)
    .filter((i) => !member || i.savedBy.some((s) => s.memberId === member));
  const noop = () => {};
  return (
    <GroupFavoritesView
      tripTitle="겨울 여행"
      people={PEOPLE}
      status={state === 'load-error' ? 'error' : 'ready'}
      view={view}
      onToggleView={setView}
      filter={filter}
      onFilter={setFilter}
      totals={{
        allPlaceCount: all.length,
        overlapPlaceCount: all.filter((i) => i.savedCount >= 2).length,
        filteredCount: items.length,
      }}
      items={items}
      onEndReached={noop}
      loadingMore={false}
      memberFilter={member}
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
      onPoll={() => setSelecting(new Set())}
      onRecommend={noop}
      onCancelSelect={() => setSelecting(null)}
      onConfirmSelect={noop}
      onRetry={noop}
      empty={
        all.length === 0 ? (
          <FavoritesEmpty onAdd={() => setAdding(true)} onRecommend={noop} />
        ) : undefined
      }
    >
      <MemberFilterSheet
        visible={memberSheet}
        onClose={() => setMemberSheet(false)}
        members={PEOPLE}
        value={member}
        onChange={setMember}
      />
      <AddPlaceSheet
        visible={adding}
        onClose={() => setAdding(false)}
        tripTitle="겨울 여행"
        onBookmarks={noop}
        onLink={noop}
        onSearch={noop}
      />
      <PlaceSheet
        item={all.find((i) => i.place.id === openId) ?? null}
        members={PEOPLE}
        myMemberId="m-me"
        onClose={() => setOpenId(null)}
        onSaveMemo={noop}
        onAdd={noop}
        onRemove={() => {
          setOpenId(null);
          setEditor('세은');
        }}
        busy={false}
      />
      <InCourseConfirm
        editor={editor}
        onRemoveAnyway={() => setEditor(null)}
        onRefresh={() => setEditor(null)}
      />
    </GroupFavoritesView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, gap: spacing[12] },
  heading: { color: colors.text.default },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
