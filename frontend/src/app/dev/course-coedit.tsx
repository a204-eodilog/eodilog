import { SCROLL_DECELERATION } from '@/theme/scroll';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AvatarGroup, Button, Header, toast } from '@/components/ui';
import { rebaseDraft } from '@/features/course/coedit-rules';
import { CoeditConflict } from '@/features/course/components/coedit-conflict';
import { CoeditorStrip } from '@/features/course/components/coeditor-strip';
import { moveItem, toDraft, type CourseDraft } from '@/features/course/course-rules';
import { DraftView } from '@/features/course/screens/course-edit-screen';
import { sampleCourse } from '@/features/course/testing';
import { colors, layout, spacing, typography } from '@/theme';

/**
 * 개발용 S23 코스 함께 편집 상태 보기. 서버 없이 코스 초안 화면에 예시 데이터를 넘겨 그린다.
 * /dev/course-coedit?state=conflict 처럼 상태를 바로 열 수 있다(contracts/routes.md).
 */

const PEOPLE = [
  { name: '세은', me: false },
  { name: '승기', me: false },
  { name: '영광', me: true },
];
const START = '2026-11-14';

const EXAMPLES = [
  { state: 'conflict', label: '같은 날 충돌 201-13453' },
  { state: 'merged', label: '다른 날 합친 뒤' },
  { state: 'editors', label: '편집 중 동행 한 명' },
  { state: 'editors-many', label: '편집 중 동행 여럿' },
];

/** 처음 코스, 내가 1일차 순서를 바꾼 초안, 세은이 2일차 시각을 바꾼 최신 코스 */
function sample() {
  const base = toDraft(sampleCourse(true), 2);
  const mine = moveItem(base, 0, 0, 1);
  const latestCourse = sampleCourse(true);
  latestCourse.version = 4;
  latestCourse.items[3] = { ...latestCourse.items[3], startTime: '11:30' };
  const merged = rebaseDraft(base, mine, toDraft(latestCourse, 2));
  return { mine, merged: merged.kind === 'merged' ? merged.draft : mine };
}

export default function DevCourseCoedit() {
  const params = useLocalSearchParams<{ state?: string }>();
  const [state, setState] = useState<string | null>(params.state ?? null);

  if (state) return <DevScreen key={state} state={state} />;

  return (
    <ScrollView
      decelerationRate={SCROLL_DECELERATION}
      style={styles.screen}
      contentContainerStyle={styles.menu}
    >
      <Text style={[typography.subBold, styles.heading]}>S23 코스 함께 편집</Text>
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

function DevScreen({ state }: { state: string }) {
  const { mine, merged } = sample();
  const [draft, setDraft] = useState<CourseDraft>(state === 'merged' ? merged : mine);
  const [day, setDay] = useState(0);
  const [editor, setEditor] = useState<string | null>(null);
  // 화면이 그려진 뒤에 띄워야 상자와 안내가 올라오는 모습이 보인다
  useEffect(() => {
    const timer = setTimeout(() => {
      if (state === 'conflict') setEditor('세은님');
      if (state === 'merged') {
        toast.show(
          '세은님이 다른 날을 고쳐서 최신 코스에 내 변경을 다시 얹었어요. 확인하고 완료를 눌러 주세요',
        );
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [state]);
  const noop = () => {};
  return (
    <Frame>
      <DraftView
        draft={draft}
        origin="saved"
        dirty
        startDate={START}
        day={day}
        onSelectDay={setDay}
        selectedLeg={null}
        onSelectLeg={noop}
        onChangeMode={noop}
        basis={null}
        onMore={noop}
        sheetIndex={null}
        onCloseSheet={noop}
        onReplace={noop}
        onMove={noop}
        onRemove={noop}
        onRecalculate={noop}
        onRedo={noop}
        onDone={noop}
        saving={false}
        extra={
          state.startsWith('editors') ? (
            <CoeditorStrip
              editors={
                state === 'editors-many'
                  ? [
                      { name: '세은', imageUrl: null },
                      { name: '승기', imageUrl: null },
                    ]
                  : [{ name: '세은', imageUrl: null }]
              }
            />
          ) : undefined
        }
      />
      <CoeditConflict
        editor={editor}
        busy={false}
        onOverwrite={() => setEditor(null)}
        onLatest={() => {
          setDraft(toDraft(sampleCourse(true), 2));
          setEditor(null);
        }}
      />
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <View style={styles.screen}>
      <Header
        title="코스 짜기"
        subtitle="겨울 여행"
        subtitleIcon="trip"
        right={<AvatarGroup people={PEOPLE} max={3} />}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, gap: spacing[12] },
  heading: { color: colors.text.default },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
