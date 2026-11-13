import { SCROLL_DECELERATION } from '@/theme/scroll';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, toast } from '@/components/ui';
import { dayLegs, toDraft } from '@/features/course/course-rules';
import { sampleCourse } from '@/features/course/testing';
import { ProposalSheet } from '@/features/on-trip/components/alternative-list';
import { BeforeStart } from '@/features/on-trip/components/before-start';
import { OnTripView } from '@/features/on-trip/screens/on-trip-screen';
import { WeatherView } from '@/features/on-trip/screens/weather-screen';
import { alternatives, weather } from '@/features/on-trip/testing';
import { colors, layout, spacing, typography } from '@/theme';

/**
 * 개발용 S25 여행 중·S26 날씨 대안 상태 보기. 서버 없이 표시 부품에 예시 데이터를 넘겨 그린다.
 * /dev/on-trip?state=during 처럼 상태를 바로 열 수 있다(contracts/routes.md).
 */

const PEOPLE = [
  { name: '세은', me: false },
  { name: '승기', me: false },
  { name: '영광', me: true },
];

const EXAMPLES = [
  { state: 'during', label: 'S25 여행 중 201-14252' },
  { state: 'no-course', label: 'S25 코스 없음 201-14433' },
  { state: 'before', label: 'S25 여행 시작 전 201-14584' },
  { state: 'weather-fail', label: 'S25 날씨 갱신 실패 201-14701' },
  { state: 'alt', label: 'S26 기본 201-14861' },
  { state: 'alt-made', label: 'S26 코스에 반영한 뒤 201-15028' },
  { state: 'alt-none', label: 'S26 대안 없음 201-15227' },
  { state: 'alt-weather-fail', label: 'S26 날씨 갱신 실패 201-29899' },
];

export default function DevOnTrip() {
  const params = useLocalSearchParams<{ state?: string }>();
  const [state, setState] = useState<string | null>(params.state ?? null);

  if (state) {
    return state.startsWith('alt') ? (
      <DevWeather key={state} state={state} />
    ) : (
      <DevToday key={state} state={state} />
    );
  }

  return (
    <ScrollView
      decelerationRate={SCROLL_DECELERATION}
      style={styles.screen}
      contentContainerStyle={styles.menu}
    >
      <Text style={[typography.subBold, styles.heading]}>S25 여행 중 · S26 날씨 대안</Text>
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
const notReady = () => toast.show('준비 중이에요');

function DevToday({ state }: { state: string }) {
  const draft = toDraft(sampleCourse(true), 2);
  const items = state === 'no-course' ? [] : draft.days[0];
  const w = weather();
  return (
    <OnTripView
      tripTitle="겨울 여행"
      people={PEOPLE}
      status="ready"
      phase={
        state === 'before'
          ? { kind: 'before', daysLeft: 2, startDate: '2026-11-14' }
          : { kind: 'during', day: 1, date: '2026-11-14' }
      }
      now={new Date('2026-11-14T09:40:00')}
      onRetry={noop}
      weather={w}
      weatherFailed={state === 'weather-fail'}
      refreshing={false}
      onRefresh={noop}
      noPlace={false}
      affected={state === 'no-course' ? null : { time: '10:00', name: '해운대 해변' }}
      checklist={{ total: 6, checked: 3 }}
      items={items}
      legs={state === 'no-course' ? [] : dayLegs(draft, 0)}
      next={state === 'no-course' ? null : 0}
      computedAt="09:40"
      onWeather={notReady}
      onChecklist={notReady}
      onAmenities={notReady}
      onCourse={notReady}
      before={
        <BeforeStart
          startDate="2026-11-14"
          regionName="부산"
          forecasts={[
            { ...w, queriedAt: '2026-11-12T21:00:00', precipitationProbability: 0.6 },
            {
              ...w,
              date: '2026-11-15',
              condition: 'CLEAR',
              precipitationProbability: 0.1,
              hourly: [],
              maxCelsius: 16,
              minCelsius: 8,
            },
          ]}
          checklist={{ total: 6, checked: 3 }}
          onChecklist={notReady}
        />
      }
    />
  );
}

function DevWeather({ state }: { state: string }) {
  const [selected, setSelected] = useState<string | null>('alt-2');
  const [sheet, setSheet] = useState(false);
  const [added, setAdded] = useState(false);
  // 웹의 아래 시트는 화면이 그려진 뒤에 열어야 올라오는 모습이 보인다
  useEffect(() => {
    if (state !== 'alt-made') return;
    const timer = setTimeout(() => setSheet(true), 300);
    return () => clearTimeout(timer);
  }, [state]);
  return (
    <WeatherView
      tripTitle="겨울 여행"
      people={PEOPLE}
      weather={weather()}
      weatherFailed={state === 'alt-weather-fail'}
      refreshing={false}
      onRefresh={noop}
      affected={{ index: 0, time: '10:00', name: '해운대 해변' }}
      phase="done"
      alternatives={state === 'alt-none' ? [] : alternatives()}
      onRetryAlternatives={noop}
      selectedId={selected}
      onSelect={setSelected}
      making={false}
      onMake={() => setSheet(true)}
      adding={false}
      added={added}
      onAddChecklist={() => setAdded(true)}
      sheet={
        <ProposalSheet
          visible={sheet}
          scope="1일차 오전 일정"
          from={{ time: '10:00', name: '해운대 해변' }}
          to={{ time: '10:00', name: '해운대 실내 수족관' }}
          onClose={() => setSheet(false)}
          onView={notReady}
        />
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
