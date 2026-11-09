import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { ChecklistView } from '@/features/checklist/screens/checklist-screen';
import { checklistItem } from '@/features/checklist/testing';
import type { ChecklistItem } from '@/features/checklist/types';
import { colors, layout, spacing, typography } from '@/theme';

/**
 * 개발용 S27 준비물 체크리스트 상태 보기. 서버 없이 ChecklistView에 예시 데이터를 넘겨 그린다.
 * /dev/checklist?state=default 처럼 상태를 바로 열 수 있다(contracts/routes.md).
 */

const PEOPLE = [
  { id: 'm-seeun', name: '세은', imageUrl: null, me: false },
  { id: 'm-seung', name: '승기', imageUrl: null, me: false },
  { id: 'm-me', name: '영광', imageUrl: null, me: true },
];

/** Figma 201-15314와 같은 여섯 항목 */
function sampleItems(): ChecklistItem[] {
  return [
    checklistItem({
      id: 'umbrella',
      label: '우산',
      source: 'AI',
      reason: '오전 비 70%',
      checked: true,
      checkedByMemberId: 'm-seeun',
    }),
    checklistItem({ id: 'raincoat', label: '우비', source: 'AI', reason: '오전 비 70%' }),
    checklistItem({
      id: 'shoes',
      label: '편한 운동화',
      source: 'AI',
      reason: '걷는 일정 2곳',
      checked: true,
      checkedByMemberId: 'm-me',
    }),
    checklistItem({
      id: 'battery',
      label: '보조배터리',
      source: 'AI',
      reason: '하루 종일 밖에 있어요',
      checked: true,
      checkedByMemberId: 'm-seeun',
    }),
    checklistItem({ id: 'pill', label: '멀미약 2개', source: 'AI', modifiedByUser: true }),
    checklistItem({ id: 'warmer', label: '손난로' }),
  ];
}

type State = 'default' | 'loading' | 'load-error' | 'not-found';

const STATES: { state: State; label: string }[] = [
  { state: 'default', label: '기본 201-15314' },
  { state: 'loading', label: '불러오는 중' },
  { state: 'load-error', label: '불러오기 실패' },
  { state: 'not-found', label: '여행 없음' },
];

const STATUS: Record<State, 'ready' | 'loading' | 'error' | 'notFound'> = {
  default: 'ready',
  loading: 'loading',
  'load-error': 'error',
  'not-found': 'notFound',
};

export default function DevChecklist() {
  const params = useLocalSearchParams<{ state?: string }>();
  const initial = STATES.find((s) => s.state === params.state)?.state ?? null;
  const [state, setState] = useState<State | null>(initial);
  const [items, setItems] = useState(sampleItems);

  if (state) {
    return (
      <ChecklistView
        tripTitle="겨울 여행"
        people={PEOPLE}
        status={STATUS[state]}
        items={items}
        onRetry={() => setState('default')}
        onToggle={(item) =>
          setItems((list) =>
            list.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    checked: !i.checked,
                    checkedByMemberId: i.checked ? null : 'm-me',
                  }
                : i,
            ),
          )
        }
        onMore={() => {}}
      />
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.menu}>
      <Text style={[typography.subBold, styles.heading]}>S27 준비물 체크리스트</Text>
      <View style={styles.row}>
        {STATES.map((s) => (
          <Button
            key={s.state}
            label={s.label}
            size="sm"
            variant="secondary"
            onPress={() => {
              setItems(sampleItems());
              setState(s.state);
            }}
          />
        ))}
      </View>
      <Button label="돌아가기" size="sm" variant="text" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, gap: spacing[12] },
  heading: { color: colors.text.default },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
