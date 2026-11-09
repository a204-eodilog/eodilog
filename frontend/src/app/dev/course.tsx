import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { toDraft } from '@/features/course/course-rules';
import { CourseView, type Person } from '@/features/course/screens/course-screen';
import { sampleCourse } from '@/features/course/testing';
import { colors, layout, spacing, typography } from '@/theme';

/**
 * 개발용 S23·S24 코스 상태 보기. 서버 없이 표시 부품에 예시 데이터를 넘겨 그린다.
 * /dev/course?state=view 처럼 상태를 바로 열 수 있다(contracts/routes.md).
 * 웹에서는 지도 자리에 "지도는 앱에서 보여요" 상자가 보인다.
 */

const PEOPLE: Person[] = [
  { id: 'm-seeun', name: '세은', imageUrl: null, me: false },
  { id: 'm-seung', name: '승기', imageUrl: null, me: false },
  { id: 'm-me', name: '영광', imageUrl: null, me: true },
];
const START = '2026-11-14';
const EDITED = '10.26(월) 세은님이 마지막으로 고쳤어요';

type Example = { state: string; label: string; group: 'S24' | 'S23' };

const EXAMPLES: Example[] = [
  { state: 'view', label: '기본 201-13969', group: 'S24' },
  { state: 'view-fail', label: '이동 시간 갱신 실패 201-29705', group: 'S24' },
  { state: 'load-error', label: '불러오기 실패', group: 'S24' },
];

export default function DevCourse() {
  const params = useLocalSearchParams<{ state?: string }>();
  const [state, setState] = useState<string | null>(params.state ?? null);
  const [busy, setBusy] = useState(false);

  const back = () => setState(null);

  if (state === 'view' || state === 'view-fail' || state === 'load-error') {
    const failed = state === 'view-fail';
    return (
      <CourseView
        tripTitle="겨울 여행"
        people={PEOPLE}
        status={state === 'load-error' ? 'error' : 'ready'}
        draft={toDraft(sampleCourse(!failed), 2)}
        startDate={START}
        edited={EDITED}
        routeFail={failed ? { basis: '10.26(월) 21:10 기준' } : undefined}
        recalcBusy={busy}
        onRecalculate={() => {
          setBusy(true);
          setTimeout(() => setBusy(false), 1500);
        }}
        onRemove={() => {}}
        onEdit={back}
        onRetry={() => setState('view')}
      />
    );
  }

  const groups = [...new Set(EXAMPLES.map((e) => e.group))];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.menu}>
      {groups.map((group) => (
        <View key={group} style={styles.group}>
          <Text style={[typography.subBold, styles.heading]}>{group}</Text>
          <View style={styles.row}>
            {EXAMPLES.filter((e) => e.group === group).map((e) => (
              <Button
                key={e.state}
                label={e.label}
                size="sm"
                variant="secondary"
                onPress={() => setState(e.state)}
              />
            ))}
          </View>
        </View>
      ))}
      <Button label="돌아가기" size="sm" variant="text" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, gap: spacing[24] },
  group: { gap: spacing[8] },
  heading: { color: colors.text.default },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
