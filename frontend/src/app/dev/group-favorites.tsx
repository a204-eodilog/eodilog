import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { MemberFilterSheet } from '@/features/group-favorites/components/member-filter-sheet';
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
  const all = sampleSaved();
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
      onOpen={noop}
      mapSelected={mapSelected}
      onMapSelect={setMapSelected}
      selecting={null}
      onAdd={noop}
      onPoll={noop}
      onRecommend={noop}
      onCancelSelect={noop}
      onConfirmSelect={noop}
      onRetry={noop}
    >
      <MemberFilterSheet
        visible={memberSheet}
        onClose={() => setMemberSheet(false)}
        members={PEOPLE}
        value={member}
        onChange={setMember}
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
