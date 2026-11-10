import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, toast } from '@/components/ui';
import {
  InsufficientView,
  NoOverlapNotice,
  RecommendFailView,
} from '@/features/recommend/components/recommend-states';
import {
  basisCells,
  insufficientLines,
  splitItems,
  type ViewState,
} from '@/features/recommend/recommend-rules';
import { RecommendView } from '@/features/recommend/screens/recommend-screen';
import { sampleItems } from '@/features/recommend/testing';
import { colors, layout, spacing, typography } from '@/theme';

/**
 * 개발용 S21 추천 결과 상태 보기. 서버 없이 RecommendView에 예시 데이터를 넘겨 그린다.
 * /dev/recommend?state=success 처럼 상태를 바로 열 수 있다(contracts/routes.md).
 */

const EXAMPLES: { state: string; label: string }[] = [
  { state: 'loading', label: '생성 중 201-10044' },
  { state: 'success', label: '성공 201-10081' },
  { state: 'noOverlap', label: '겹침 없음 201-10340' },
  { state: 'insufficient', label: '자료 부족 201-10470' },
  { state: 'failed', label: '생성 실패 201-10530' },
];

export default function DevRecommend() {
  const params = useLocalSearchParams<{ state?: string }>();
  const [state, setState] = useState<string | null>(params.state ?? null);

  if (state) return <DevScreen key={state} state={state} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.menu}>
      <Text style={[typography.subBold, styles.heading]}>S21 추천 결과</Text>
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

/** 미리보기 안에서도 담기를 눌러 담김으로 바뀌는 것을 볼 수 있다 */
function DevScreen({ state }: { state: string }) {
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [startedAt] = useState(() => Date.now());
  const { regions, places } = splitItems(sampleItems());
  return (
    <RecommendView
      state={state as ViewState}
      startedAt={startedAt}
      progress={0}
      placeCount={5}
      peopleCount={3}
      regions={regions}
      places={places}
      cells={basisCells({ sharedPlaceCount: 5, usedMemberCount: 3 }, 3, '부산', '11.14 – 11.15')}
      savedIds={saved}
      savingIds={new Set()}
      onSave={(id) => setSaved(new Set([...saved, id]))}
      onVote={() => toast.show('준비 중이에요')}
      onRedo={() => {}}
      notice={state === 'noOverlap' ? <NoOverlapNotice /> : undefined}
      other={
        state === 'insufficient' ? (
          <InsufficientView
            lines={insufficientLines({ sharedPlaceCount: 1, usedMemberCount: 1 })}
            onMorePlaces={() => toast.show('그룹 즐겨찾기로 가요')}
            onPreferences={() => toast.show('취향 입력으로 가요')}
          />
        ) : state === 'failed' ? (
          <RecommendFailView onRetry={() => {}} />
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, gap: spacing[12] },
  heading: { color: colors.text.default },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
