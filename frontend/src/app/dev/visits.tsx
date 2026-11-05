import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, CenterNotice, Header, toast } from '@/components/ui';
import { VisitListView } from '@/features/visit/components/visit-list-view';
import type { ItineraryItem, Visit } from '@/features/visit/types';
import { buildVisitDays, visitSummary } from '@/features/visit/visit-rules';
import { colors, layout, spacing } from '@/theme';

/**
 * 개발용 S33 상태 보기. 서버 없이 예시 데이터로 그린다.
 * 앱 흐름에는 안 나오고 /dev/visits로만 들어온다. '방문 후보 없음'에서는 [다녀옴]·[되돌리기]를 눌러 볼 수 있다
 */

const START = '2026-11-14';

const PEOPLE = [
  { name: '지우', imageUrl: null, me: true },
  { name: '서연', imageUrl: null, me: false },
  { name: '민준', imageUrl: null, me: false },
];

function item(
  placeId: string,
  name: string,
  day: number,
  order: number,
  time: string | null,
): ItineraryItem {
  return { id: `i-${placeId}`, place: { id: placeId, name }, day, order, startTime: time };
}

const ITEMS = [
  item('p1', '안목해변 카페거리', 1, 1, '10:00'),
  item('p2', '경포호 산책길', 1, 2, '13:30'),
  item('p3', '초당순두부 마을', 1, 3, '18:00'),
  item('p4', '주문진 수산시장', 2, 1, '09:30'),
  item('p5', '하슬라 아트월드', 2, 2, null),
];

function visit(
  placeId: string,
  evidenceType: Visit['evidenceType'],
  reviewScore: number | null = null,
): Visit {
  return {
    id: `v-${placeId}`,
    tripId: 't1',
    memberId: 'm-me',
    placeId,
    visitedAt: '2026-11-14T01:00:00Z',
    evidenceType,
    reviewId: reviewScore === null ? null : `r-${placeId}`,
    reviewScore,
  };
}

const PHOTO_VISITS = [visit('p1', 'PHOTO'), visit('p2', 'PHOTO'), visit('p4', 'PHOTO')];
const MANUAL_VISITS = [
  visit('p1', 'PHOTO', 4),
  visit('p2', 'PHOTO'),
  visit('p3', 'MANUAL'),
  visit('p4', 'PHOTO'),
];

type Example = 'photo' | 'manual' | 'none' | 'error';

export default function VisitStates() {
  const [view, setView] = useState<Example | null>(null);
  const [checked, setChecked] = useState<Visit[]>([]);
  const back = () => {
    setView(null);
    setChecked([]);
  };
  const ready = () => toast.show('준비 중이에요');

  if (view === 'error') {
    return (
      <View style={styles.screen}>
        <Header title="평가" onBack={back} />
        <CenterNotice
          icon="alert"
          title="방문 장소를 불러오지 못했어요"
          description="다시 시도해 주세요"
          actionLabel="다시 시도"
          actionIcon="refresh"
          onAction={back}
        />
      </View>
    );
  }

  if (view) {
    const visits = view === 'photo' ? PHOTO_VISITS : view === 'manual' ? MANUAL_VISITS : checked;
    const days = buildVisitDays(ITEMS, visits, START);
    return (
      <VisitListView
        tripTitle="겨울 여행"
        people={PEOPLE}
        days={days}
        summary={visitSummary(days)}
        onBack={back}
        onReview={ready}
        onUpload={ready}
        onCheck={(row) => {
          const v = visit(row.placeId, 'MANUAL');
          setChecked((old) => [v, ...old]);
          toast.show('다녀온 곳으로 표시했어요', {
            action: {
              label: '되돌리기',
              onPress: () => setChecked((old) => old.filter((x) => x.id !== v.id)),
            },
          });
        }}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.menu} style={styles.screen}>
      <View style={styles.row}>
        <Button label="방문 후보 있음" variant="neutral" onPress={() => setView('photo')} />
        <Button label="직접 체크" variant="neutral" onPress={() => setView('manual')} />
        <Button label="방문 후보 없음" variant="neutral" onPress={() => setView('none')} />
        <Button label="불러오기 실패" variant="neutral" onPress={() => setView('error')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, paddingTop: 80, gap: spacing[16] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
