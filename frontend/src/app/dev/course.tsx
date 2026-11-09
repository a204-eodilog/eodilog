import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AvatarGroup, Button, Header } from '@/components/ui';
import {
  addPlace,
  dayLegs,
  emptyDraft,
  moveItem,
  removeItem,
  setLegMode,
  toDraft,
  type CourseDraft,
} from '@/features/course/course-rules';
import { AutoFailView, AutoLoadingView } from '@/features/course/components/auto-views';
import { ManualBuilder } from '@/features/course/components/manual-builder';
import { ChooseView, NoDatesView, NoRegionView } from '@/features/course/components/setup-views';
import { DraftView, newKey, type DraftOrigin } from '@/features/course/screens/course-edit-screen';
import { CourseView, type Person } from '@/features/course/screens/course-screen';
import { place, sampleCourse, savedPlace } from '@/features/course/testing';
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
  { state: 'choose', label: '구성 방식 선택 201-12269', group: 'S23' },
  { state: 'no-region', label: '여행지 미정 201-12377', group: 'S23' },
  { state: 'no-dates', label: '기간 없음 201-12442', group: 'S23' },
  { state: 'auto-loading', label: '자동 추천 생성 중 201-12610', group: 'S23' },
  { state: 'auto-fail', label: '자동 추천 실패 201-12684', group: 'S23' },
  { state: 'draft', label: '코스 초안 201-12879', group: 'S23' },
  { state: 'no-route', label: '이동 시간 계산 불가 201-13272', group: 'S23' },
  { state: 'item-sheet', label: '장소 교체·순서·삭제 201-13071', group: 'S23' },
  { state: 'manual', label: '직접 만들기 201-12753', group: 'S23' },
  { state: 'manual-placed', label: '직접 만들기 · 장소 놓은 뒤 523-349', group: 'S23' },
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

  if (state === 'no-route') {
    return (
      <EditFrame>
        <DevDraft initial={toDraft(sampleCourse(false), 2)} origin="proposal" openSheet={null} />
      </EditFrame>
    );
  }

  if (state === 'draft' || state === 'item-sheet') {
    return (
      <EditFrame>
        <DevDraft
          initial={toDraft(sampleCourse(true), 2)}
          origin="proposal"
          openSheet={state === 'item-sheet' ? 1 : null}
        />
      </EditFrame>
    );
  }

  if (state === 'choose') {
    return (
      <EditFrame>
        <ChooseView
          regionName="부산"
          period="11.14(토) – 11.15(일)"
          savedCount={5}
          onAuto={() => setState('auto-loading')}
          onManual={() => setState('manual')}
        />
      </EditFrame>
    );
  }
  if (state === 'no-region') {
    return (
      <EditFrame>
        <NoRegionView onPickRegion={back} />
      </EditFrame>
    );
  }
  if (state === 'no-dates') {
    return (
      <EditFrame>
        <DevDates />
      </EditFrame>
    );
  }
  if (state === 'auto-loading') {
    return (
      <EditFrame>
        <AutoLoadingView savedCount={5} />
      </EditFrame>
    );
  }
  if (state === 'auto-fail') {
    return (
      <EditFrame>
        <AutoFailView
          onRetry={() => setState('auto-loading')}
          onManual={() => setState('manual')}
        />
      </EditFrame>
    );
  }

  if (state === 'manual' || state === 'manual-placed') {
    return (
      <EditFrame>
        <DevManual placed={state === 'manual-placed'} />
      </EditFrame>
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

/** S23 머리. 실제 화면과 같은 제목·여행 이름·동행 얼굴 */
function EditFrame({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.screen}>
      <Header
        title="코스 짜기"
        subtitle="겨울 여행"
        subtitleIcon="trip"
        right={<AvatarGroup people={PEOPLE.map((p) => ({ name: p.name, me: p.me }))} max={3} />}
      />
      {children}
    </View>
  );
}

/** 미리보기 안에서도 순서·빼기·수단을 바꿔 볼 수 있는 초안 */
function DevDraft(props: { initial: CourseDraft; origin: DraftOrigin; openSheet: number | null }) {
  const [draft, setDraft] = useState(props.initial);
  const [dirty, setDirty] = useState(false);
  const [day, setDay] = useState(0);
  const [leg, setLeg] = useState<string | null>(null);
  const [sheet, setSheet] = useState<number | null>(null);
  // 웹의 아래 시트는 화면이 그려진 뒤에 열어야 올라오는 모습이 보인다
  useEffect(() => {
    if (props.openSheet === null) return;
    const timer = setTimeout(() => setSheet(props.openSheet), 300);
    return () => clearTimeout(timer);
  }, [props.openSheet]);
  const change = (next: CourseDraft) => {
    setDraft(next);
    setDirty(true);
  };
  return (
    <DraftView
      draft={draft}
      origin={props.origin}
      dirty={dirty}
      startDate={START}
      day={day}
      onSelectDay={setDay}
      selectedLeg={leg}
      onSelectLeg={setLeg}
      onChangeMode={(mode) => {
        const target = dayLegs(draft, day).find((l) => l.key === leg) ?? dayLegs(draft, day)[0];
        if (target) change(setLegMode(draft, target.key, mode));
      }}
      basis="10.26(월) 20:40 기준"
      onMore={setSheet}
      sheetIndex={sheet}
      onCloseSheet={() => setSheet(null)}
      onReplace={() => setSheet(null)}
      onMove={(delta) => {
        if (sheet === null) return;
        change(moveItem(draft, day, sheet, delta));
        setSheet(sheet + delta);
      }}
      onRemove={() => {
        if (sheet === null) return;
        change(removeItem(draft, day, sheet));
        setSheet(null);
      }}
      onRecalculate={() => {}}
      onRedo={() => {}}
      onDone={() => setDirty(false)}
      saving={false}
    />
  );
}

const SAVED = [
  place('p-haeundae', '해운대 해변'),
  place('p-gwangalli', '광안리 바다뷰 카페'),
  place('p-seomyeon', '서면 돼지국밥집'),
  place('p-gamcheon', '감천문화마을'),
  place('p-huinnyeoul', '흰여울문화마을'),
].map((p) => savedPlace(p));

/** 미리보기 안에서 칩을 눌러 놓아 볼 수 있는 직접 만들기 */
function DevManual({ placed }: { placed: boolean }) {
  const [draft, setDraft] = useState(() => {
    let d = emptyDraft(1, 2);
    if (placed) {
      for (const s of SAVED.slice(0, 3)) d = addPlace(d, 0, s.place, newKey());
    }
    return d;
  });
  const [day, setDay] = useState(0);
  const [sheet, setSheet] = useState<number | null>(null);
  return (
    <ManualBuilder
      draft={draft}
      startDate={START}
      day={day}
      onSelectDay={setDay}
      saved={SAVED}
      onPlace={(p) => setDraft(addPlace(draft, day, p, newKey()))}
      onFind={() => {}}
      onBuild={() => {}}
      sheetIndex={sheet}
      onMore={(d, i) => {
        setDay(d);
        setSheet(i);
      }}
      onCloseSheet={() => setSheet(null)}
      onReplace={() => setSheet(null)}
      onMove={(delta) => {
        if (sheet === null) return;
        setDraft(moveItem(draft, day, sheet, delta));
        setSheet(sheet + delta);
      }}
      onRemove={() => {
        if (sheet === null) return;
        setDraft(removeItem(draft, day, sheet));
        setSheet(null);
      }}
    />
  );
}

/** Figma 201-12442처럼 12.05(토)–12.06(일) 1박 2일을 고른 기간 없음 */
function DevDates() {
  const [value, setValue] = useState<{ start: string; end: string | null } | null>({
    start: '2026-12-05',
    end: '2026-12-06',
  });
  return (
    <NoDatesView
      regionName="강릉"
      value={value}
      onChange={setValue}
      onNext={() => {}}
      saving={false}
    />
  );
}
