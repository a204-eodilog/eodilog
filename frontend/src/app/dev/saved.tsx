import { SCROLL_DECELERATION } from '@/theme/scroll';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, toast } from '@/components/ui';
import { SavedView } from '@/features/saved/components/saved-view';
import type { SavedView as ViewMode } from '@/features/saved/hooks/use-bookmarks';
import { toSavedItem } from '@/features/saved/saved-rules';
import type { Bookmark } from '@/features/saved/types';
import { colors, layout, spacing } from '@/theme';

/**
 * 개발용 S10 상태 보기. 서버 없이 값 문서 예시 데이터로 그린다.
 * 앱 흐름에는 안 나오고 /dev/saved로만 들어온다. 지도는 웹에서 회색 대체 화면이다
 */

const EXAMPLES: [string, string, number, number, string | null][] = [
  ['광안리 바다뷰 카페', '부산광역시 수영구 광안해변로 219', 35.1532, 129.1186, null],
  ['강문 해변', '강원특별자치도 강릉시 강문동 산1', 37.7953, 128.9184, 'feed-1'],
  ['전포 카페거리', '부산광역시 부산진구 전포대로 209', 35.1557, 129.0636, null],
  ['흰여울문화마을', '부산광역시 영도구 영선동4가 1044', 35.0784, 129.0447, null],
  ['명주동 골목 카페', '강원특별자치도 강릉시 명주동 15', 37.7537, 128.8957, 'feed-2'],
];

const ITEMS = EXAMPLES.map(([name, address, latitude, longitude, sourceFeedId], i) =>
  toSavedItem({
    place: {
      id: `p${i}`,
      name,
      address,
      latitude,
      longitude,
      regionId: null,
      provider: null,
      providerPlaceId: null,
      source: 'PROVIDER',
    },
    retainedPlace: { name, latitude, longitude },
    memo: null,
    sourceFeedId,
    sourceUnavailable: false,
    createdAt: '2026-11-05T01:00:00Z',
  } satisfies Bookmark),
);

type Example = 'list' | 'map' | 'empty' | 'offline';

export default function SavedStates() {
  const [example, setExample] = useState<Example | null>(null);
  const [view, setView] = useState<ViewMode>('list');
  const ready = () => toast.show('준비 중이에요');

  if (!example) {
    const open = (e: Example) => {
      setView(e === 'map' ? 'map' : 'list');
      setExample(e);
    };
    return (
      <ScrollView
        decelerationRate={SCROLL_DECELERATION}
        contentContainerStyle={styles.menu}
        style={styles.screen}
      >
        <View style={styles.row}>
          <Button label="목록 보기" variant="neutral" onPress={() => open('list')} />
          <Button label="지도 보기" variant="neutral" onPress={() => open('map')} />
          <Button label="저장 없음" variant="neutral" onPress={() => open('empty')} />
          <Button label="연결 끊김" variant="neutral" onPress={() => open('offline')} />
        </View>
      </ScrollView>
    );
  }

  return (
    <SavedView
      items={example === 'empty' ? [] : ITEMS}
      view={view}
      onView={setView}
      offline={example === 'offline'}
      // 개발용 화면에는 뒤로 버튼이 없어 [그룹]을 누르면 상태 고르기로 돌아간다
      onGroup={() => setExample(null)}
      onOpen={ready}
      onAdd={ready}
      onSearch={ready}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, paddingTop: 80, gap: spacing[16] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
