import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, toast } from '@/components/ui';
import { dayLegs, toDraft } from '@/features/course/course-rules';
import { CourseView } from '@/features/course/screens/course-screen';
import { sampleCourse } from '@/features/course/testing';
import { ProposalCompare } from '@/features/proposal/components/proposal-compare';
import {
  basisLine,
  compareRows,
  proposalDraft,
  stats,
  summary,
} from '@/features/proposal/proposal-rules';
import { ProposalView } from '@/features/proposal/screens/proposal-screen';
import { removalContent } from '@/features/proposal/testing';
import { colors, layout, spacing, typography } from '@/theme';

/**
 * 개발용 S29 AI 변경안 상태 보기. 서버 없이 표시 부품에 예시 데이터를 넘겨 그린다.
 * /dev/proposal?state=compare 처럼 상태를 바로 열 수 있다(contracts/routes.md).
 */

const PEOPLE = [
  { name: '세은', me: false },
  { name: '승기', me: false },
  { name: '영광', me: true },
];

const EXAMPLES = [
  { state: 'loading', label: '만드는 중' },
  { state: 'compare', label: '비교 201-16028' },
  { state: 'applied', label: '적용 후 201-16198' },
  { state: 'failed', label: '재계산 실패 201-16329' },
  { state: 'unsupported', label: '장소 빼기 아직 안 됨' },
];

export default function DevProposal() {
  const params = useLocalSearchParams<{ state?: string }>();
  const [state, setState] = useState<string | null>(params.state ?? null);

  if (state === 'applied') return <DevApplied />;
  if (state) return <DevScreen key={state} state={state} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.menu}>
      <Text style={[typography.subBold, styles.heading]}>S29 AI 변경안</Text>
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

const noop = () => {};

function DevScreen({ state }: { state: string }) {
  const current = toDraft(sampleCourse(true), 2);
  const proposed = proposalDraft(removalContent(), 3, 2);
  const { rows, removed } = compareRows(current.days[0], proposed.days[0]);
  return (
    <ProposalView
      tripTitle="겨울 여행"
      people={PEOPLE}
      state={
        state === 'failed' || state === 'unsupported' || state === 'loading' ? state : 'compare'
      }
      onRetry={noop}
      onCourse={noop}
      onEdit={() => toast.show('코스 편집으로 가요')}
      compare={
        <ProposalCompare
          summary={summary(current, proposed, null)}
          summaryIcon="close"
          stats={stats(current.days[0], dayLegs(current, 0), proposed.days[0])}
          basis={basisLine(proposed, '2026-11-14T12:05:00')}
          items={proposed.days[0]}
          legs={dayLegs(proposed, 0)}
          rows={rows}
          removed={removed}
          applying={false}
          onApply={() => toast.show('적용하면 코스 화면으로 가요')}
          onSkip={noop}
        />
      }
    />
  );
}

/** 적용 뒤 S24. 알림의 [되돌리기]와 동행에게 알렸다는 줄 */
function DevApplied() {
  const course = sampleCourse(true);
  course.items = course.items.filter((i) => i.id !== 'i2');
  useEffect(() => {
    const timer = setTimeout(
      () =>
        toast.success('새 코스를 적용했어요', {
          action: { label: '되돌리기', onPress: () => toast.show('되돌렸어요') },
        }),
      300,
    );
    return () => clearTimeout(timer);
  }, []);
  return (
    <CourseView
      tripTitle="겨울 여행"
      people={PEOPLE.map((p, i) => ({ ...p, id: `m-${i}`, imageUrl: null }))}
      status="ready"
      draft={toDraft(course, 2)}
      startDate="2026-11-14"
      edited="11.14(토) 12:10 승기님이 마지막으로 고쳤어요"
      routeFail={undefined}
      recalcBusy={false}
      onRecalculate={noop}
      onRemove={noop}
      onEdit={noop}
      onRetry={noop}
      applied
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, gap: spacing[12] },
  heading: { color: colors.text.default },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
